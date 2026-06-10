import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import {
    getBurnCheckedInstruction,
    getPermissionedBurnCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { resolveTokenAccount, decimalAmountToRaw, getMintDetails } from '../transaction-util';
import { getPermissionedBurnAuthority } from './permissioned-burn';

/**
 * Creates a transaction to burn tokens from the owner's token account.
 * This is a self-burn operation where the token owner burns their own tokens.
 *
 * If the mint has the permissioned burn extension, the configured burn authority
 * must co-sign and the permissioned burn instruction is used instead. The authority
 * defaults to the one configured on the mint (as a noop signer) when not provided.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param owner - The token owner's wallet address
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param feePayer - The fee payer signer
 * @param permissionedBurnAuthority - Burn authority signer for permissioned burn mints
 * @returns A promise that resolves to a FullTransaction object for burning tokens
 */
export const createBurnTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    owner: Address | TransactionSigner<string>,
    decimalAmount: number,
    feePayer: Address | TransactionSigner<string>,
    permissionedBurnAuthority?: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
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

    // Regular burns are rejected on permissioned burn mints: the configured burn
    // authority must co-sign a permissioned burn instruction instead.
    const configuredBurnAuthority = await getPermissionedBurnAuthority(rpc, mint);

    const burnInstruction = configuredBurnAuthority
        ? getPermissionedBurnCheckedInstruction(
              {
                  account: tokenAccount,
                  mint,
                  permissionedBurnAuthority:
                      permissionedBurnAuthority === undefined || typeof permissionedBurnAuthority === 'string'
                          ? createNoopSigner(permissionedBurnAuthority ?? configuredBurnAuthority)
                          : permissionedBurnAuthority,
                  authority: ownerSigner,
                  amount: rawAmount,
                  decimals,
              },
              {
                  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
              },
          )
        : getBurnCheckedInstruction(
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

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(feePayerSigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions([burnInstruction], m),
    ) as FullTransaction;
};
