import {
    type Address,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import { getUpdateTransferHookInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

export interface UpdateTransferHookOptions {
    mint: Address;
    /** Current transfer hook authority; must sign the transaction. */
    authority: TransactionSigner;
    /** New hook program id, or null to clear the mint back to an inactive (no-hook) state. */
    programId: Address | null;
    feePayer: TransactionSigner;
}

/**
 * Creates a transaction that updates a mint's TransferHook program id.
 * Pass `programId: null` to detach the current hook program, leaving the extension
 * present on the mint but inert.
 */
export const createUpdateTransferHookTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    options: UpdateTransferHookOptions,
): Promise<FullTransaction> => {
    const { mint, authority, programId, feePayer } = options;

    const instruction = getUpdateTransferHookInstruction(
        {
            mint,
            authority,
            programId,
        },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions([instruction], m),
    ) as FullTransaction;
};
