import type {
  Address,
  Rpc,
  SolanaRpcApi,
  FullTransaction,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionSigner,
  TransactionWithBlockhashLifetime,
  Instruction,
} from 'gill';
import { createNoopSigner, createTransaction } from 'gill';
import {
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { resolveTokenAccount } from '../transactionUtil';
import { getEbaltsFreezeInstructions } from '../ebalts/freeze';

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
export const createFreezeAccountInstructions = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  account: Address,
  freezeAuthority: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>
): Promise<Instruction[]> => {
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const freezeAuthoritySigner =
    typeof freezeAuthority === 'string'
      ? createNoopSigner(freezeAuthority)
      : freezeAuthority;

  // Resolve the token account
  const { tokenAccount, isInitialized, isFrozen } = await resolveTokenAccount(
    rpc,
    account,
    mint
  );
  const instructions = [];

  // If the account provided is a wallet address, create an ATA for it
  // this repo currently assumes that all tokens use EBALTS so it will be frozen by default
  if (!isInitialized) {
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

  if (!isFrozen) {
    instructions.push(
      ...(await getEbaltsFreezeInstructions(
        rpc,
        mint,
        freezeAuthoritySigner,
        account,
        tokenAccount
      ))
    );
  }

  return instructions;
};

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
  const instructions = await createFreezeAccountInstructions(
    rpc,
    mint,
    account,
    freezeAuthority,
    feePayer
  );
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer: feePayerSigner,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};