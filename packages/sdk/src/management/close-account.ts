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
import { getCloseAccountInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { resolveTokenAccount } from '../transaction-util';

/**
 * Creates a transaction to close an empty token account and reclaim the rent.
 * The token account must have a zero balance.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param owner - The token account owner's wallet address
 * @param destination - The address to receive the reclaimed SOL rent
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for closing the account
 */
export const createCloseAccountTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    owner: Address | TransactionSigner<string>,
    destination: Address,
    feePayer: Address | TransactionSigner<string>,
): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const ownerSigner = typeof owner === 'string' ? createNoopSigner(owner) : owner;
    const ownerAddress = typeof owner === 'string' ? owner : owner.address;

    // Resolve owner's token account
    const { tokenAccount, isInitialized } = await resolveTokenAccount(rpc, ownerAddress, mint);

    if (!isInitialized) {
        throw new Error('Token account does not exist for this mint');
    }

    // Create close account instruction
    const closeInstruction = getCloseAccountInstruction(
        {
            account: tokenAccount,
            destination,
            owner: ownerSigner,
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
        instructions: [closeInstruction],
    });
};
