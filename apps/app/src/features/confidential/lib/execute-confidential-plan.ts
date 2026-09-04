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
import type { FullTransaction } from '@/lib/solana/types';

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
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Transient public-RPC conditions — rate limits, load-balanced nodes lagging
// behind the latest state, dropped txs / expired blockhashes. All are safe to
// retry with a fresh blockhash.
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
 * Flattens a {@link TransactionPlan} into its transaction messages in execution
 * order (depth-first). Confidential flows are order-dependent (context-state
 * setup → action → cleanup), so we always send them one at a time in order.
 */
function flattenPlan(plan: TransactionPlan): unknown[] {
    if (plan.kind === 'single') return [plan.message];
    return plan.plans.flatMap(flattenPlan);
}

/** Progress callback: `(current, total)` as each transaction in a plan is sent. */
export type ConfidentialPlanProgress = (current: number, total: number) => void;

/**
 * Plans a confidential `InstructionPlan` into fee-payer-bound transaction
 * messages, then signs, sends, and confirms each in order — returning every
 * signature. `onProgress` fires before each transaction so multi-tx proof flows
 * can surface "sending 2/3".
 */
export async function executeConfidentialPlan(input: {
    instructionPlan: InstructionPlan;
    feePayer: TransactionSigner;
    rpc: Rpc<SolanaRpcApi>;
    onProgress?: ConfidentialPlanProgress;
}): Promise<Signature[]> {
    // Lazy import: pulls in the @solana/zk-sdk WASM dependency only when a
    // confidential operation actually runs.
    const { planConfidentialInstructions } = await import('@solana/mosaic-sdk/confidential');
    const plan = await planConfidentialInstructions({
        instructionPlan: input.instructionPlan,
        feePayer: input.feePayer,
    });
    const messages = flattenPlan(plan);

    const signatures: Signature[] = [];
    for (let i = 0; i < messages.length; i++) {
        input.onProgress?.(i + 1, messages.length);
        signatures.push(await signSendConfirm(input.rpc, messages[i]));
    }
    return signatures;
}
