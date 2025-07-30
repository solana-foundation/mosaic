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
  getCreateAssociatedTokenIdempotentInstruction,
  getFreezeAccountInstruction,
  getThawAccountInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { resolveTokenAccount } from '../transactionUtil';

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
  const { tokenAccount, wasOwnerAddress } = await resolveTokenAccount(
    rpc,
    account,
    mint
  );
  const instructions = [];

  // If the account provided is a wallet address, create an ATA for it
  if (wasOwnerAddress) {
    console.log('Creating ATA for account', account);
    instructions.push(
      getCreateAssociatedTokenIdempotentInstruction({
        payer: feePayerSigner,
        ata: tokenAccount,
        owner: account,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
    );
  }

  instructions.push(
    getFreezeAccountInstruction(
      {
        account: tokenAccount,
        mint,
        owner: freezeAuthoritySigner,
      },
      {
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
      }
    )
  );

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  return createTransaction({
    feePayer: feePayerSigner,
    version: 'legacy',
    latestBlockhash,
    instructions,
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

  const instruction = getThawAccountInstruction(
    {
      account: tokenAccount,
      mint,
      owner: freezeAuthoritySigner,
    },
    { programAddress: TOKEN_2022_PROGRAM_ADDRESS }
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
