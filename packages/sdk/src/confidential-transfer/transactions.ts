import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    type Instruction,
    pipe,
    type Rpc,
    type SolanaRpcApi,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type TransactionSigner,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';

export async function createTransaction(
    rpc: Rpc<SolanaRpcApi>,
    feePayer: TransactionSigner<string>,
    instructions: Instruction[],
): Promise<FullTransaction> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
}
