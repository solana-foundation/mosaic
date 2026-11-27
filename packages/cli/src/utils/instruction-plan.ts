import type { Ora } from 'ora';
import {
    type TransactionMessage,
    type InstructionPlan,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
    type TransactionMessageWithFeePayer,
    type TransactionPlan,
    type TransactionSigner,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import { outputRawTransaction } from './raw-tx.js';
import type { FullTransaction } from './types.js';

/**
 * Confidential-transfer SDK builders return a kit `InstructionPlan` rather than a single
 * transaction message: several of them (configure, transfer, withdraw, mint, burn) span multiple
 * transactions, verifying zero-knowledge proofs into context-state accounts in setup transactions,
 * referencing them in the action, and reclaiming rent in a cleanup transaction. This module is the
 * `InstructionPlan` counterpart to `sendOrOutputTransaction`: it plans the instructions into
 * transaction messages and either sends them in order, or prints them for `--raw-tx`.
 *
 * The send path polls `getSignatureStatuses` with `skipPreflight: true` rather than using WebSocket
 * confirmation, which is more robust against lagging public RPC nodes.
 */

export type TxVersion = 0 | 1;

type PlannedMessage = TransactionMessage & TransactionMessageWithFeePayer;

/** Writes simulated resource limits onto a message that already has its lifetime (version 1 only). */
export type EstimateLimits = <T extends PlannedMessage>(message: T) => Promise<T>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// `\b` keeps a base58 signature or address that happens to contain "429" from reading as a rate limit.
const RATE_LIMITED = /\b429\b|Too Many Requests/i;

/**
 * Thrown when a transaction did not land before its blockhash expired. Only then is it safe to
 * send the same message again with a fresh blockhash: until expiry the first copy can still land,
 * and a confidential deposit or transfer that lands twice moves the amount twice.
 */
export class BlockhashExpiredError extends Error {
    constructor(signature: Signature) {
        super(`Transaction ${signature} expired before it was confirmed (block height exceeded)`);
        this.name = 'BlockhashExpiredError';
    }
}

/** Thrown when a transaction landed and failed on chain. It fails the same way every time. */
export class TransactionFailedError extends Error {
    constructor(signature: Signature, err: unknown) {
        super(`Transaction ${signature} failed: ${stringifyErr(err)}`);
        this.name = 'TransactionFailedError';
    }
}

/**
 * Thrown when a transaction was sent but its outcome could not be read, because the RPC kept
 * rate-limiting the status checks. The transaction may still land, so it is never resent.
 */
export class UnconfirmedTransactionError extends Error {
    constructor(signature: Signature, cause: unknown) {
        super(
            `Could not confirm transaction ${signature}: the RPC kept rate-limiting status checks. It may still land; check its status before running the command again.`,
            { cause },
        );
        this.name = 'UnconfirmedTransactionError';
    }
}

/**
 * Whether a send attempt failed in a way a retry with a fresh blockhash can fix: rate limiting
 * before the transaction was sent, a blockhash the node doesn't know yet, or a transaction that
 * expired unconfirmed.
 *
 * Everything else is final. In particular a transaction that landed and failed on chain (for
 * example `IncorrectProgramId`, or a fee payer with no SOL to debit) fails the same way every
 * time, so retrying it only delays the error, and a sent transaction whose status can't be read
 * may still land.
 */
export function isRetryableSendError(error: unknown): boolean {
    if (error instanceof BlockhashExpiredError) return true;
    if (error instanceof TransactionFailedError || error instanceof UnconfirmedTransactionError) return false;
    const message = error instanceof Error ? error.message : String(error);
    return RATE_LIMITED.test(message) || /BlockhashNotFound|Blockhash not found/i.test(message);
}

/** Runs an RPC call, retrying on HTTP 429 with exponential backoff. */
async function withBackoff<T>(label: string, fn: () => Promise<T>, initialDelayMs = 500): Promise<T> {
    let delay = initialDelayMs;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (!RATE_LIMITED.test((err as Error)?.message ?? '')) throw err;
            await sleep(delay);
            delay = Math.min(delay * 2, 8_000);
        }
    }
    throw new Error(`${label}: exhausted retries after repeated HTTP 429 responses`);
}

function stringifyErr(err: unknown): string {
    return JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Settings for {@link signSendConfirm}; the defaults are tuned for public devnet. */
export interface SendOptions {
    /** Writes the resource limits a version-1 message needs; omitted for version 0. */
    estimateLimits?: EstimateLimits;
    /** Send attempts before giving up on retryable errors. */
    attempts?: number;
    /** Delay between status polls, and before a retry. */
    pollIntervalMs?: number;
    /** First delay of the exponential backoff on HTTP 429. */
    rateLimitBackoffMs?: number;
}

/**
 * Sets a fresh blockhash on `baseMessage`, signs it, sends it and polls until it is confirmed.
 * Retries only on {@link isRetryableSendError}. Once a transaction is sent, it is resent only
 * after its blockhash has provably expired.
 */
export async function signSendConfirm(
    rpc: Rpc<SolanaRpcApi>,
    baseMessage: PlannedMessage,
    { estimateLimits, attempts = 6, pollIntervalMs = 1_000, rateLimitBackoffMs = 500 }: SendOptions = {},
): Promise<Signature> {
    const backoff = <T>(label: string, fn: () => Promise<T>) => withBackoff(label, fn, rateLimitBackoffMs);
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const { value: bh } = await backoff('getLatestBlockhash', () => rpc.getLatestBlockhash().send());
            let message = setTransactionMessageLifetimeUsingBlockhash(bh, baseMessage);
            if (estimateLimits) {
                const withLifetime = message;
                message = await backoff('simulateTransaction', () => estimateLimits(withLifetime));
            }
            const signed = await signTransactionMessageWithSigners(message);
            const signature = getSignatureFromTransaction(signed);
            const wire = getBase64EncodedWireTransaction(signed);
            await backoff('sendTransaction', () =>
                rpc.sendTransaction(wire, { encoding: 'base64', skipPreflight: true }).send(),
            );
            try {
                for (;;) {
                    const status = await backoff('getSignatureStatuses', () =>
                        rpc.getSignatureStatuses([signature]).send(),
                    );
                    const entry = status.value[0];
                    if (entry?.err) throw new TransactionFailedError(signature, entry.err);
                    if (entry?.confirmationStatus === 'confirmed' || entry?.confirmationStatus === 'finalized') {
                        return signature;
                    }
                    const height = await backoff('getBlockHeight', () => rpc.getBlockHeight().send());
                    if (height > bh.lastValidBlockHeight) throw new BlockhashExpiredError(signature);
                    await sleep(pollIntervalMs);
                }
            } catch (err) {
                // Past this point the transaction may land: only a proven expiry or an on-chain
                // failure settles it. Anything else that a retry would act on is reported instead.
                if (err instanceof BlockhashExpiredError || !isRetryableSendError(err)) throw err;
                throw new UnconfirmedTransactionError(signature, err);
            }
        } catch (err) {
            lastErr = err;
            if (!isRetryableSendError(err)) throw err;
            await sleep(pollIntervalMs * 2);
        }
    }
    throw lastErr;
}

/**
 * Flattens a {@link TransactionPlan} into its transaction messages in execution order (depth
 * first). Parallel groups are flattened too: the confidential flows are order-dependent
 * (context-state setup, then the action, then cleanup), so the CLI always sends one at a time.
 */
export function flattenPlan(plan: TransactionPlan): PlannedMessage[] {
    if (plan.kind === 'single') return [plan.message];
    return plan.plans.flatMap(flattenPlan);
}

/** What {@link sendOrOutputInstructionPlan} reads from the global and per-command options. */
export interface PlanSendOptions {
    rawTx?: string;
    txVersion?: TxVersion;
}

/**
 * Plans a confidential `InstructionPlan` into transaction messages and either sends them (signing
 * and confirming each, in order) or, under `--raw-tx`, prints every transaction with an index
 * header.
 *
 * With `--raw-tx`, keys this process holds sign the printed transactions, including the ephemeral
 * context-state accounts a proof flow creates. The external signer still has to sign and send the
 * transactions in the printed order, before their blockhash expires. Version 1 can't be printed:
 * its resource limits come from simulating each transaction after the ones before it landed.
 */
export async function sendOrOutputInstructionPlan(
    instructionPlan: InstructionPlan,
    feePayer: TransactionSigner,
    rpc: Rpc<SolanaRpcApi>,
    { rawTx, txVersion = 0 }: PlanSendOptions,
    spinner: Ora,
): Promise<{ raw: boolean; signatures?: Signature[] }> {
    if (rawTx && txVersion === 1) {
        throw new Error(
            '--raw-tx cannot be combined with --tx-version 1: version-1 resource limits are set by simulating each transaction at send time.',
        );
    }

    spinner.text = 'Planning transactions...';
    // Lazy import: pulls in the @solana/zk-sdk WASM dependency only when a confidential
    // operation actually runs, not for every `mosaic` command.
    const { planConfidentialInstructions, estimateAndSetConfidentialResourceLimits } =
        await import('@solana/mosaic-sdk/confidential');
    const plan = await planConfidentialInstructions({ instructionPlan, feePayer, version: txVersion });
    const messages = flattenPlan(plan);

    if (rawTx) {
        const { value: bh } = await rpc.getLatestBlockhash().send();
        for (let i = 0; i < messages.length; i++) {
            const withLifetime = setTransactionMessageLifetimeUsingBlockhash(bh, messages[i]);
            if (messages.length > 1) console.log(`# transaction ${i + 1}/${messages.length}`);
            await outputRawTransaction(rawTx, withLifetime as FullTransaction);
        }
        return { raw: true };
    }

    const estimateLimits: EstimateLimits | undefined =
        txVersion === 1
            ? message => estimateAndSetConfidentialResourceLimits({ rpc, transactionMessage: message })
            : undefined;

    const signatures: Signature[] = [];
    for (let i = 0; i < messages.length; i++) {
        spinner.text =
            messages.length > 1 ? `Sending transaction ${i + 1}/${messages.length}...` : 'Sending transaction...';
        signatures.push(await signSendConfirm(rpc, messages[i], { estimateLimits }));
    }
    return { raw: false, signatures };
}
