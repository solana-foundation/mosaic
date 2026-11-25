import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type GetLatestBlockhashApi,
    type Instruction,
    type Rpc,
    type TransactionSigner,
} from '@solana/kit';
import type { FullTransaction } from './transaction-util.js';

/**
 * A version 0 transaction carrying `instructions`, with `feePayer` attached as the fee payer
 * signer and the cluster's latest blockhash as its lifetime.
 *
 * `feePayer` must be the same signer object the instructions carry for its address, or Kit
 * refuses to sign. Resolve the fee payer together with the authorities through
 * `resolveSigners` / `resolveFeePayerAndAuthority` (signers.ts) before building the instructions.
 */
export async function buildFullTransaction(
    rpc: Rpc<GetLatestBlockhashApi>,
    feePayer: TransactionSigner<string>,
    instructions: readonly Instruction[],
): Promise<FullTransaction> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
}
