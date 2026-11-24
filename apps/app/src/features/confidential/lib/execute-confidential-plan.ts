import {
    type InstructionPlan,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
    type TransactionSigner,
    flattenTransactionPlan,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import type { estimateAndSetConfidentialResourceLimits } from '@solana/mosaic-sdk/confidential';
import type { FullTransaction } from '@/lib/solana/types';
import type { ConfidentialTxVersion } from './transaction-version';

/**
 * Confidential-transfer SDK builders return a kit `InstructionPlan` rather than a
 * single transaction message: several of them (configure, transfer, withdraw)
 * span multiple transactions — zero-knowledge proofs are verified into dedicated
 * context-state accounts in setup transactions, the token instruction references
 * them, and a cleanup transaction reclaims the rent.
 *
 * This is the browser counterpart to the CLI's `sendOrOutputInstructionPlan`
 * (`packages/cli/src/utils/instruction-plan.ts`): it plans the instructions into
 * fee-payer-bound messages and signs/sends/confirms each in order. Confirmation
 * polls `getSignatureStatuses` (with `skipPreflight: true` on send), which is
 * more robust than WebSocket confirmation against lagging public RPCs.
 *
 * ## Retries
 *
 * A signed transaction is never replaced while it can still land. Deposits and
 * withdrawals are not idempotent, so signing the same instruction again under a
 * new blockhash while the first copy is in flight can execute it twice. The send
 * loop therefore rebroadcasts the *same* signed transaction until it confirms,
 * fails on chain, or its blockhash expires with no trace of it; only that last
 * outcome re-signs. Every re-sign is a wallet prompt, so nothing else does:
 * an on-chain execution error is final, and the "node is lagging" symptoms are
 * retried only in the pre-sign simulation, which prompts nobody and executes
 * nothing.
 *
 * ## Transaction version
 *
 * `version` selects the format the SDK planner packs into. It defaults to `0`,
 * which is what this module has always sent. At `version: 1` (SIMD-0385) the
 * planner gets 4096 bytes per message instead of 1232 and folds proof setup, the
 * token instruction and cleanup into far fewer transactions — but version 1
 * carries its resource limits in header fields that **default to zero on chain**,
 * with none of the 200k-compute-units-per-instruction fallback legacy and
 * version-0 transactions get. A version-1 message sent without them fails, so
 * the send loop below simulates and sets them per transaction. See
 * `useConfidentialTxVersion` for how the version is chosen. A version-1 plan
 * needs a version-1-capable signer: `@solana/connector` ≥ 0.3.0, whose
 * `useKitTransactionSigner` is built on `@solana/wallet-account-signer`. Before
 * 0.3.0 its hand-rolled Kit bridge capped transactions at 1232 bytes and wrote
 * version-1 wire bytes signatures-first.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// What a version-1 simulation reports when it lands on a load-balanced node that
// has not caught up with the plan's previous transaction yet: the proof
// context-state account it created is missing (so still system-owned), or the
// blockhash fetched a moment ago is unknown there. Retried before signing only,
// where a retry costs no wallet prompt and cannot execute anything.
const NODE_LAG = /debit an account|could not find|AccountNotFound|IncorrectProgramId|BlockhashNotFound/i;
const PRESIGN_LAG_RETRIES = 4;

// How many times one transaction may be signed. Each signing is a wallet
// prompt, and a re-sign only happens after the previous copy provably expired.
const MAX_SIGNINGS = 3;

// Block heights past `lastValidBlockHeight` to wait before declaring a
// transaction expired. Status and block-height reads can hit different nodes
// behind a load balancer; the margin lets a lagging node catch up with a
// transaction that did land before we trust its "not found".
const EXPIRY_MARGIN = 32n;

// Upper bound on waiting for one signed transaction. Expiry normally settles it
// in about a minute; this only stops a stuck RPC from hanging the flow.
const SETTLE_TIMEOUT_MS = 180_000;

// A wallet or node that cannot handle a version-1 transaction at all: an
// unknown message version, a wire transaction it fails to deserialize, or an
// RPC whose simulation result omits `loadedAccountsDataSize` (which version 1
// cannot be sent without, so the SDK's estimator throws on it). Also covers a
// version-1-unaware signing path: `@solana/connector`'s legacy 1232-byte size
// check, which rejects before the wallet is asked, and web3.js-based wallets'
// `VersionedTransaction.deserialize` ("Transaction message version 1
// deserialization is not supported", "…with version 0 but found version 1").
// Kept narrow and separate from TRANSIENT on purpose — it triggers a re-plan at
// version 0, and must never swallow a genuine failure of the operation itself
// (a user rejection, in particular, must not silently re-prompt at version 0).
const V1_UNSUPPORTED =
    /unsupported (transaction|message) version|unknown (transaction|message) version|transaction version .* not supported|message version \d+ deserialization is not supported|with version 0 but found version|failed to deserialize|loadedAccountsDataSize|Transaction too large: \d+ bytes \(max 1232/i;

/**
 * Every message in an error's `cause` chain, joined.
 *
 * Kit wraps the real failure: a 429 from `simulateTransaction` surfaces as
 * `SolanaError: Failed to estimate the compute unit consumption for this
 * transaction message`, with `HTTP error (429): Too Many Requests` only on
 * `cause`. Matching the outer message alone therefore misses both the rate
 * limits that should be retried and the format rejections that should fall back
 * to version 0 — so every classifier below reads the whole chain.
 *
 * `@solana/connector` wraps differently: its `ConnectorError` keeps the wrapped
 * error on `originalError` and leaves `cause` unset, so a wallet failure surfaces
 * as the bare "Failed to sign transaction 1 of 1". Each link therefore follows
 * `cause` first and `originalError` second.
 */
function messageChain(err: unknown): string {
    const parts: string[] = [];
    let current: unknown = err;
    // Bounded: a malformed `cause` graph could otherwise cycle forever.
    for (let depth = 0; current instanceof Error && depth < 8; depth++) {
        parts.push(current.message);
        current = current.cause ?? (current as { originalError?: unknown }).originalError;
    }
    return parts.join(' | ');
}

/** Runs an RPC call, retrying on HTTP 429 with exponential backoff. */
async function withBackoff<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let delay = 500;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (!/429|Too Many Requests/i.test(messageChain(err))) throw err;
            await sleep(delay);
            delay = Math.min(delay * 2, 8_000);
        }
    }
    throw new Error(`${label}: exhausted retries after repeated 429s`);
}

/**
 * Replaces the provisory resource limits a version-1 planner left behind with
 * simulated ones. Injected rather than imported at module scope so the
 * `@solana/zk-sdk` WASM behind `@solana/mosaic-sdk/confidential` stays lazy.
 */
type EstimateResourceLimits = typeof estimateAndSetConfidentialResourceLimits;

/** JSON-stringifies an on-chain transaction error, which may hold bigints. */
function describeTxError(err: unknown): string {
    return JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/**
 * Gives `baseMessage` a fresh blockhash and, at version 1, simulated resource
 * limits. Nothing is signed here, so the node-lag symptoms are safe to retry.
 */
async function prepareMessage(
    rpc: Rpc<SolanaRpcApi>,
    baseMessage: unknown,
    version: ConfidentialTxVersion,
    estimateResourceLimits: EstimateResourceLimits,
): Promise<{ message: FullTransaction; lastValidBlockHeight: bigint }> {
    for (let attempt = 0; ; attempt++) {
        try {
            const { value: bh } = await withBackoff('getLatestBlockhash', () => rpc.getLatestBlockhash().send());
            const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
                bh,
                baseMessage as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[1],
            );
            // Version 1 only, and deliberately here rather than once over the
            // whole plan: simulation needs a lifetime (planned messages have
            // none), and a plan's later transactions read proof context-state
            // accounts its own earlier transactions create, so simulating them
            // before those land fails on a missing account.
            const message =
                version === 1
                    ? await withBackoff('estimateResourceLimits', () =>
                          estimateResourceLimits({ rpc, transactionMessage: withLifetime as FullTransaction }),
                      )
                    : withLifetime;
            return { message: message as FullTransaction, lastValidBlockHeight: bh.lastValidBlockHeight };
        } catch (err) {
            if (attempt >= PRESIGN_LAG_RETRIES || !NODE_LAG.test(messageChain(err))) throw err;
            await sleep(2_000); // let the lagging node catch up
        }
    }
}

/**
 * Sends one signed transaction and waits for its outcome, rebroadcasting the
 * same bytes while it is unseen. Resolves `'confirmed'`, or `'expired'` once its
 * blockhash has expired and no node knows the signature, which is the only
 * state in which signing a replacement cannot double-execute. An on-chain
 * failure throws.
 */
async function sendUntilSettled(
    rpc: Rpc<SolanaRpcApi>,
    wire: ReturnType<typeof getBase64EncodedWireTransaction>,
    signature: Signature,
    lastValidBlockHeight: bigint,
): Promise<'confirmed' | 'expired'> {
    const send = () => rpc.sendTransaction(wire, { encoding: 'base64', skipPreflight: true }).send();
    // The first send's errors propagate: a node refusing the bytes outright
    // (malformed, unsupported version) will refuse every rebroadcast too, and
    // the version-1 fallback reads exactly those errors.
    await withBackoff('sendTransaction', send);

    // Settles a status entry: confirmed, failed on chain, or still pending (null).
    const settle = (entry: { err: unknown; confirmationStatus: string | null } | null) => {
        if (entry?.err) throw new Error(`Transaction ${signature} failed: ${describeTxError(entry.err)}`);
        if (entry?.confirmationStatus === 'confirmed' || entry?.confirmationStatus === 'finalized')
            return 'confirmed' as const;
        return null;
    };

    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let lastBroadcast = Date.now();
    while (Date.now() < deadline) {
        const { value } = await withBackoff('getSignatureStatuses', () => rpc.getSignatureStatuses([signature]).send());
        const entry = value[0];
        if (settle(entry)) return 'confirmed';

        if (!entry) {
            const height = await withBackoff('getBlockHeight', () =>
                rpc.getBlockHeight({ commitment: 'confirmed' }).send(),
            );
            if (height > lastValidBlockHeight + EXPIRY_MARGIN) {
                // The blockhash is past its last valid height, so this
                // transaction can no longer be included. Check the full history
                // once in case it landed and the recent-status cache missed it.
                const { value: history } = await withBackoff('getSignatureStatuses', () =>
                    rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send(),
                );
                if (!history[0]) return 'expired';
                if (settle(history[0])) return 'confirmed';
            } else if (Date.now() - lastBroadcast >= 2_000) {
                // Same bytes, same signature: a rebroadcast can land at most once.
                lastBroadcast = Date.now();
                await send().catch(() => {
                    /* best effort; the status poll decides */
                });
            }
        }
        await sleep(1_000);
    }
    throw new Error(
        `Transaction ${signature} was neither confirmed nor expired within ${SETTLE_TIMEOUT_MS / 1000}s. ` +
            'Check it in the explorer before trying again: it may still land.',
    );
}

/**
 * Signs `baseMessage` with a fresh blockhash, sends it, and waits for it. Signs
 * again (a new wallet prompt) only after the previous copy expired unexecuted.
 */
async function signSendConfirm(
    rpc: Rpc<SolanaRpcApi>,
    baseMessage: unknown,
    version: ConfidentialTxVersion,
    estimateResourceLimits: EstimateResourceLimits,
): Promise<Signature> {
    for (let signing = 1; ; signing++) {
        const { message, lastValidBlockHeight } = await prepareMessage(
            rpc,
            baseMessage,
            version,
            estimateResourceLimits,
        );
        const signed = await signTransactionMessageWithSigners(message);
        const signature = getSignatureFromTransaction(signed);
        const outcome = await sendUntilSettled(
            rpc,
            getBase64EncodedWireTransaction(signed),
            signature,
            lastValidBlockHeight,
        );
        if (outcome === 'confirmed') return signature;
        if (signing >= MAX_SIGNINGS)
            throw new Error(
                `Transaction expired before landing ${signing} times (last: ${signature}). Nothing was executed; try again.`,
            );
    }
}

/** Progress callback: `(current, total)` as each transaction in a plan is sent. */
export type ConfidentialPlanProgress = (current: number, total: number) => void;

/**
 * A plan that stopped part-way: some of its transactions confirmed, a later one
 * failed. Those confirmed transactions already changed state on chain (proof
 * context-state accounts hold rent until the plan's cleanup runs), so the caller
 * gets their signatures and a {@link ConfidentialPlanError.resume} that sends
 * the rest of the *same* planned messages, starting at the one that failed.
 */
export class ConfidentialPlanError extends Error {
    constructor(
        cause: unknown,
        /** Signatures of the transactions that confirmed, in plan order. */
        readonly signatures: Signature[],
        /** Number of transactions in the whole plan. */
        readonly total: number,
        /** Sends the remaining transactions; resolves with every signature of the plan. */
        public resume: (onProgress?: ConfidentialPlanProgress) => Promise<Signature[]>,
    ) {
        super(`Stopped after ${signatures.length} of ${total} transactions: ${messageChain(cause) || String(cause)}`, {
            cause,
        });
        this.name = 'ConfidentialPlanError';
    }
}

/**
 * Plans a confidential `InstructionPlan` into fee-payer-bound transaction
 * messages, then signs, sends, and confirms each in order — returning every
 * signature. `onProgress` fires before each transaction so multi-tx proof flows
 * can surface "sending 2/3". A failure after the first transaction confirmed
 * throws a {@link ConfidentialPlanError}.
 *
 * At `version: 1`, a failure that looks like the wallet or the node rejecting
 * the format falls back to version 0 and starts over — but only while nothing
 * has landed yet. Once the first transaction confirms, the plan's proof
 * context-state accounts exist on chain and re-planning would be wrong, so from
 * that point the error propagates.
 */
export async function executeConfidentialPlan(input: {
    instructionPlan: InstructionPlan;
    feePayer: TransactionSigner;
    rpc: Rpc<SolanaRpcApi>;
    onProgress?: ConfidentialPlanProgress;
    /** Transaction format to plan into. Defaults to `0`. */
    version?: ConfidentialTxVersion;
}): Promise<Signature[]> {
    // Lazy import: pulls in the @solana/zk-sdk WASM dependency only when a
    // confidential operation actually runs.
    const { estimateAndSetConfidentialResourceLimits: estimateResourceLimits, planConfidentialInstructions } =
        await import('@solana/mosaic-sdk/confidential');

    /** Sends `messages[start..]`, appending to the signatures of `messages[..start]`. */
    const sendFrom = async (
        messages: unknown[],
        version: ConfidentialTxVersion,
        start: number,
        confirmed: Signature[],
        onProgress?: ConfidentialPlanProgress,
    ): Promise<Signature[]> => {
        const signatures = [...confirmed];
        for (let i = start; i < messages.length; i++) {
            onProgress?.(i + 1, messages.length);
            try {
                signatures.push(await signSendConfirm(input.rpc, messages[i], version, estimateResourceLimits));
            } catch (err) {
                if (signatures.length === 0) throw err;
                const done = [...signatures];
                throw new ConfidentialPlanError(err, done, messages.length, resumeProgress =>
                    sendFrom(messages, version, i, done, resumeProgress),
                );
            }
        }
        return signatures;
    };

    const run = async (version: ConfidentialTxVersion): Promise<Signature[]> => {
        const plan = await planConfidentialInstructions({
            instructionPlan: input.instructionPlan,
            feePayer: input.feePayer,
            version,
        });
        const messages = flattenTransactionPlan(plan).map(single => single.message);
        return sendFrom(messages, version, 0, [], input.onProgress);
    };

    const version = input.version ?? 0;
    try {
        return await run(version);
    } catch (err) {
        if (version !== 1 || err instanceof ConfidentialPlanError) throw err;

        const message = messageChain(err);
        if (V1_UNSUPPORTED.test(message)) return run(0);

        // A version-1 attempt that failed before anything landed, in a way
        // V1_UNSUPPORTED does not recognise. It may still be a wallet or node
        // refusing the format under wording we have not seen — the set of
        // rejection strings is not something we can enumerate up front — so name
        // the version in the error rather than letting the raw message imply the
        // operation itself is broken. The original text is preserved verbatim so
        // it can be read off the UI and folded into V1_UNSUPPORTED.
        throw new Error(`Confidential operation failed on a version-1 transaction: ${message}`, { cause: err });
    }
}
