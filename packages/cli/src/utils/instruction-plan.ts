import type { Ora } from 'ora';
import {
    type InstructionPlan,
    type Rpc,
    type Signature,
    type SolanaRpcApi,
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
 * Confidential-transfer SDK builders return a kit `InstructionPlan` rather than a
 * single transaction message: several of them (configure, transfer, withdraw) span
 * multiple transactions, verifying zero-knowledge proofs into context-state accounts
 * in setup transactions, referencing them in the action, and reclaiming rent in a
 * cleanup transaction. This helper is the `InstructionPlan` counterpart to
 * `sendOrOutputTransaction` — it plans the instructions into transaction messages and
 * either sends them (signing + confirming each) or outputs them for `--raw-tx`.
 *
 * The send path mirrors the polling send/confirm loop proven in the SDK's devnet
 * end-to-end test (`packages/sdk/src/__tests__/integration/confidential.test.ts`):
 * a fresh blockhash per attempt, `skipPreflight: true`, and `getSignatureStatuses`
 * polling — more robust than WebSocket confirmation against lagging public RPCs.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Transient public-RPC conditions — rate limits, load-balanced nodes lagging behind
// the latest state, dropped txs / expired blockhashes. All are safe to retry with a
// fresh blockhash.
const TRANSIENT =
    /429|Too Many Requests|debit an account|could not find|IncorrectProgramId|Blockhash(NotFound)?|block height exceeded|not confirmed|BlockhashNotFound/i;

/** Runs an RPC call, retrying on HTTP 429 with exponential backoff. */
async function withBackoff<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let delay = 500;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = (err as Error).message ?? '';
            if (!/429|Too Many Requests/i.test(msg)) throw err;
            await sleep(delay);
            delay = Math.min(delay * 2, 8_000);
        }
    }
    throw new Error(`${label}: exhausted retries after repeated 429s`);
}

/** Signs `baseMessage` with a fresh blockhash, sends it, and polls until confirmed. */
async function signSendConfirm(rpc: Rpc<SolanaRpcApi>, baseMessage: unknown): Promise<Signature> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            const { value: bh } = await withBackoff('getLatestBlockhash', () => rpc.getLatestBlockhash().send());
            const message = setTransactionMessageLifetimeUsingBlockhash(
                bh,
                baseMessage as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[1],
            );
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
            if (!TRANSIENT.test((err as Error).message ?? '')) throw err;
            await sleep(2_000); // let lagging nodes catch up, then retry with a fresh blockhash
        }
    }
    throw lastErr;
}

/**
 * Flattens a {@link TransactionPlan} into its transaction messages in execution order
 * (depth-first). Sequential and parallel groups are both flattened in order — the
 * confidential flows are order-dependent (context-state setup → action → cleanup), so
 * the CLI always sends them one at a time.
 */
function flattenPlan(plan: TransactionPlan): unknown[] {
    if (plan.kind === 'single') return [plan.message];
    return plan.plans.flatMap(flattenPlan);
}

/**
 * Plans a confidential `InstructionPlan` into transaction messages and either sends
 * them (signing + confirming each, returning all signatures) or, under `--raw-tx`,
 * prints every transaction (index header + b64/b58) without sending.
 *
 * ⚠️ Multi-transaction proof flows (transfer, withdraw) create ephemeral context-state
 * signer accounts at build time whose secret keys live only in this process, so the
 * `--raw-tx` output of those flows is for inspection only — it cannot be re-signed
 * offline. Single-transaction ops round-trip through `--raw-tx` cleanly.
 */
export async function sendOrOutputInstructionPlan(
    instructionPlan: InstructionPlan,
    feePayer: TransactionSigner,
    rpc: Rpc<SolanaRpcApi>,
    rawTx: string | undefined,
    spinner: Ora,
): Promise<{ raw: boolean; signatures?: Signature[] }> {
    spinner.text = 'Planning transactions...';
    // Lazy import: pulls in the @solana/zk-sdk WASM dependency only when a
    // confidential operation actually runs, not for every `mosaic` command.
    const { planConfidentialInstructions } = await import('@solana/mosaic-sdk/confidential');
    const plan = await planConfidentialInstructions({ instructionPlan, feePayer });
    const messages = flattenPlan(plan);

    if (rawTx) {
        // Plan messages carry no blockhash; add a lifetime so they can be compiled and
        // serialized. Inspection-only for multi-tx proof flows (see note above).
        const { value: bh } = await rpc.getLatestBlockhash().send();
        messages.forEach((message, i) => {
            const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
                bh,
                message as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[1],
            );
            console.log(`# transaction ${i + 1}/${messages.length}`);
            outputRawTransaction(rawTx, withLifetime as FullTransaction);
        });
        return { raw: true };
    }

    const signatures: Signature[] = [];
    for (let i = 0; i < messages.length; i++) {
        spinner.text =
            messages.length > 1 ? `Sending transaction ${i + 1}/${messages.length}...` : 'Sending transaction...';
        signatures.push(await signSendConfirm(rpc, messages[i]));
    }
    return { raw: false, signatures };
}
