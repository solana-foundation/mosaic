import {
    type InstructionPlan,
    type TransactionPlan,
    type TransactionPlanner,
    type TransactionSigner,
    createTransactionMessage,
    createTransactionPlanner,
    pipe,
    setTransactionMessageFeePayerSigner,
} from '@solana/kit';

/**
 * Confidential-transfer operations return a kit `InstructionPlan` rather than a
 * single `FullTransaction`, because several of them (configure, withdraw,
 * transfer) span multiple transactions: zero-knowledge proofs are verified into
 * dedicated context-state accounts in setup transactions, the token instruction
 * then references them, and a cleanup transaction reclaims the rent.
 *
 * This module turns those plans into concrete, fee-payer-bound transaction
 * messages. It stays "build only" — it does **not** fetch a blockhash, sign, or
 * send. The caller adds the lifetime and signs/sends each message in the
 * returned {@link TransactionPlan} (or drives it with kit's
 * `createTransactionPlanExecutor`).
 */

/**
 * Builds a kit {@link TransactionPlanner} that packs a confidential
 * `InstructionPlan` into version-0 transaction messages, each paid for by
 * `feePayer`.
 */
export function createConfidentialTransactionPlanner(feePayer: TransactionSigner): TransactionPlanner {
    return createTransactionPlanner({
        createTransactionMessage: () =>
            pipe(createTransactionMessage({ version: 0 }), m => setTransactionMessageFeePayerSigner(feePayer, m)),
    });
}

/**
 * Convenience wrapper: plans `instructionPlan` into a {@link TransactionPlan} of
 * fee-payer-bound, version-0 messages (no blockhash, unsigned). Equivalent to
 * `createConfidentialTransactionPlanner(feePayer)(instructionPlan)`.
 */
export async function planConfidentialInstructions(input: {
    instructionPlan: InstructionPlan;
    feePayer: TransactionSigner;
}): Promise<TransactionPlan> {
    return createConfidentialTransactionPlanner(input.feePayer)(input.instructionPlan);
}
