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
import {
  getAssociatedTokenAccountAddress,
  getFreezeAccountInstruction,
  getThawAccountInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';

/**
 * Determines if an address is an Associated Token Account or wallet address
 * Returns the token account address to use for freeze/thaw operations
 *
 * @param rpc - The Solana RPC client instance
 * @param account - The account address (could be wallet or ATA)
 * @param mint - The mint address
 * @returns Promise with the token account address and whether it was derived
 */
export async function resolveTokenAccount(
  rpc: Rpc<SolanaRpcApi>,
  account: Address,
  mint: Address
): Promise<{ tokenAccount: Address; wasOwnerAddress: boolean }> {
  try {
    // First check if the account exists and get its info
    const accountInfo = await rpc
      .getAccountInfo(account, { encoding: 'base64' })
      .send();

    if (accountInfo.value) {
      // Account exists, check if it's a token account
      const data = Buffer.from(accountInfo.value.data[0], 'base64');
      
      // Check if it's owned by TOKEN_2022_PROGRAM (token account)
      if (accountInfo.value.owner === TOKEN_2022_PROGRAM_ADDRESS) {
        // Parse the mint address from token account data (first 32 bytes)
        const tokenMint = data.subarray(0, 32);
        const mintBuffer = Buffer.from(mint.replace(/^0x/, ''), 'hex');
        
        if (tokenMint.equals(mintBuffer)) {
          // It's a token account for this mint
          return { tokenAccount: account, wasOwnerAddress: false };
        } else {
          throw new Error(`Token account ${account} is not for mint ${mint}`);
        }
      }
    }
    
    // If we reach here, it's either a non-existent account or not a token account
    // Treat it as a wallet address and derive the ATA
    const ata = await getAssociatedTokenAccountAddress(
      mint,
      account,
      TOKEN_2022_PROGRAM_ADDRESS
    );
    
    // Check if the ATA exists
    const ataInfo = await rpc.getAccountInfo(ata).send();
    if (!ataInfo.value) {
      throw new Error(`Associated Token Account for owner ${account} and mint ${mint} does not exist`);
    }
    
    return { tokenAccount: ata, wasOwnerAddress: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      throw error;
    }
    
    // If checking the account failed, try to derive ATA anyway
    const ata = await getAssociatedTokenAccountAddress(
      mint,
      account,
      TOKEN_2022_PROGRAM_ADDRESS
    );
    
    return { tokenAccount: ata, wasOwnerAddress: true };
  }
}

/**
 * Creates a transaction to freeze a token account
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param account - The account address (wallet or ATA)
 * @param freezeAuthority - The freeze authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for freezing the account
 */
export const createFreezeAccountTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  freezeAuthority: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>
): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const freezeAuthoritySigner =
    typeof freezeAuthority === 'string'
      ? createNoopSigner(freezeAuthority)
      : freezeAuthority;

  // Resolve the token account
  const { tokenAccount } = await resolveTokenAccount(rpc, account, mint);

  const instruction = getFreezeAccountInstruction(
    {
      account: tokenAccount,
      mint,
      owner: freezeAuthoritySigner,
    },
    {
      programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    }
  );

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  return createTransaction({
    feePayer: feePayerSigner,
    version: 'legacy',
    latestBlockhash,
    instructions: [instruction],
  });
};

/**
 * Creates a transaction to thaw a token account
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param account - The account address (wallet or ATA)
 * @param freezeAuthority - The freeze authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for thawing the account
 */
export const createThawAccountTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  freezeAuthority: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>
): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const freezeAuthoritySigner =
    typeof freezeAuthority === 'string'
      ? createNoopSigner(freezeAuthority)
      : freezeAuthority;

  // Resolve the token account
  const { tokenAccount } = await resolveTokenAccount(rpc, account, mint);

  const instruction = getThawAccountInstruction({
    account: tokenAccount,
    mint,
      owner: freezeAuthoritySigner,
    },
    {
      programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    }
  );

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  return createTransaction({
    feePayer: feePayerSigner,
    version: 'legacy',
    latestBlockhash,
    instructions: [instruction],
  });
};