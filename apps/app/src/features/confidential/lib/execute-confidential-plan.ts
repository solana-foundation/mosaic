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
 * fee-payer-bound messages and signs/sends/confirms each in order with a fresh
 * blockhash. The send loop mirrors the polling send/confirm approach proven in
 * the SDK's devnet end-to-end test — a fresh blockhash per attempt,
 * `skipPreflight: true`, and `getSignatureStatuses` polling — which is more
 * robust than WebSocket confirmation against lagging public RPCs.
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
 * `useConfidentialTxVersion` for how the version is chosen.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Transient public-RPC conditions — rate limits, load-balanced nodes lagging
// behind the latest state, dropped txs / expired blockhashes. All are safe to
// retry with a fresh blockhash.
const TRANSIENT =
    /429|Too Many Requests|debit an account|could not find|IncorrectProgramId|Blockhash(NotFound)?|block height exceeded|not confirmed|BlockhashNotFound/i;

// A wallet or node that cannot handle a version-1 transaction at all: an
// unknown message version, a wire transaction it fails to deserialize, or an
// RPC whose simulation result omits `loadedAccountsDataSize` (which version 1
// cannot be sent without, so the SDK's estimator throws on it). Kept narrow and
// separate from TRANSIENT on purpose — it triggers a re-plan at version 0, and
// must never swallow a genuine failure of the operation itself.
const V1_UNSUPPORTED =
    /unsupported (transaction|message) version|unknown (transaction|message) version|transaction version .* not supported|failed to deserialize|loadedAccountsDataSize/i;

/**
 * Every message in an error's `cause` chain, joined.
 *
 * Kit wraps the real failure: a 429 from `simulateTransaction` surfaces as
 * `SolanaError: Failed to estimate the compute unit consumption for this
 * transaction message`, with `HTTP error (429): Too Many Requests` only on
 * `cause`. Matching the outer message alone therefore misses both the rate
 * limits that should be retried and the format rejections that should fall back
 * to version 0 — so every classifier below reads the whole chain.
 */
function messageChain(err: unknown): string {
    const parts: string[] = [];
    let current: unknown = err;
    // Bounded: a malformed `cause` graph could otherwise cycle forever.
    for (let depth = 0; current instanceof Error && depth < 8; depth++) {
        parts.push(current.message);
        current = current.cause;
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

/** Signs `baseMessage` with a fresh blockhash, sends it, and polls until confirmed. */
async function signSendConfirm(
    rpc: Rpc<SolanaRpcApi>,
    baseMessage: unknown,
    version: ConfidentialTxVersion,
    estimateResourceLimits: EstimateResourceLimits,
): Promise<Signature> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
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
            const signed = await signTransactionMessageWithSigners(message as FullTransaction);
            const signature = getSignatureFromTransaction(signed);
            const wire = getBase64EncodedWireTransaction(signed);
            // skipPreflight avoids spurious preflight failures on lagging public-RPC
            // nodes; execution errors still surface via getSignatureStatuses below.
            await withBackoff('sendTransaction', () =>
                rpc.sendTransaction(wire, { encoding: 'base64', skipPreflight: true }).send(),
            );
            const deadline = Date.now() + 45_000;
            while (Date.now() < deadline) {
                const status = await withBackoff('getSignatureStatuses', () =>
                    rpc.getSignatureStatuses([signature]).send(),
                );
                const entry = status.value[0];
                if (entry?.err)
                    throw new Error(
                        `Transaction ${signature} failed: ${JSON.stringify(entry.err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
                    );
                if (entry?.confirmationStatus === 'confirmed' || entry?.confirmationStatus === 'finalized')
                    return signature;
                await sleep(1_000);
            }
            throw new Error(`Transaction ${signature} not confirmed within 45s`);
        } catch (err) {
            lastErr = err;
            if (!TRANSIENT.test(messageChain(err))) throw err;
            await sleep(2_000); // let lagging nodes catch up, then retry with a fresh blockhash
        }
    }
    throw lastErr;
}

/** Progress callback: `(current, total)` as each transaction in a plan is sent. */
export type ConfidentialPlanProgress = (current: number, total: number) => void;

/**
 * Plans a confidential `InstructionPlan` into fee-payer-bound transaction
 * messages, then signs, sends, and confirms each in order — returning every
 * signature. `onProgress` fires before each transaction so multi-tx proof flows
 * can surface "sending 2/3".
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

    const run = async (version: ConfidentialTxVersion, signatures: Signature[]): Promise<Signature[]> => {
        const plan = await planConfidentialInstructions({
            instructionPlan: input.instructionPlan,
            feePayer: input.feePayer,
            version,
        });
        const messages = flattenTransactionPlan(plan).map(single => single.message);

        for (let i = 0; i < messages.length; i++) {
            input.onProgress?.(i + 1, messages.length);
            signatures.push(await signSendConfirm(input.rpc, messages[i], version, estimateResourceLimits));
        }
        return signatures;
    };

    const version = input.version ?? 0;
    const signatures: Signature[] = [];
    try {
        return await run(version, signatures);
    } catch (err) {
        if (version !== 1 || signatures.length > 0) throw err;

        const message = messageChain(err);
        if (V1_UNSUPPORTED.test(message)) return run(0, signatures);

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
