import type {
    Address,
    Rpc,
    SolanaRpcApi,
    FullTransaction,
    TransactionMessageWithFeePayer,
    TransactionVersion,
    TransactionSigner,
    TransactionWithBlockhashLifetime,
} from 'gill';
import { createNoopSigner, createTransaction } from 'gill';
import { getBurnCheckedInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { resolveTokenAccount, decimalAmountToRaw, getMintDetails } from '../transaction-util';

/**
 * Creates a transaction to burn tokens from the owner's token account.
 * This is a self-burn operation where the token owner burns their own tokens.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param owner - The token owner's wallet address
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for burning tokens
 */
export const createBurnTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    owner: Address | TransactionSigner<string>,
    decimalAmount: number,
    feePayer: Address | TransactionSigner<string>,
): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const ownerSigner = typeof owner === 'string' ? createNoopSigner(owner) : owner;
    const ownerAddress = typeof owner === 'string' ? owner : owner.address;

    // Get mint info to determine decimals
    const { decimals } = await getMintDetails(rpc, mint);

    // Convert decimal amount to raw amount
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    // Resolve owner's token account
    const { tokenAccount, isInitialized, balance } = await resolveTokenAccount(rpc, ownerAddress, mint);

    if (!isInitialized) {
        throw new Error('Token account does not exist for this mint');
    }

    if (balance < rawAmount) {
        throw new Error('Insufficient token balance for burn');
    }

    // Create burn instruction
    const burnInstruction = getBurnCheckedInstruction(
        {
            account: tokenAccount,
            mint,
            authority: ownerSigner,
            amount: rawAmount,
            decimals,
        },
        {
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        },
    );

    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return createTransaction({
        feePayer: feePayerSigner,
        version: 'legacy',
        latestBlockhash,
        instructions: [burnInstruction],
    });
};
