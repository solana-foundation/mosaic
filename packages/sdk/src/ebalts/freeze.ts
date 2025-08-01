import {
  createTransaction,
  type Address,
  type FullTransaction,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionMessageWithFeePayer,
  type TransactionSigner,
  type TransactionVersion,
  type TransactionWithBlockhashLifetime,
} from 'gill';
import { findMintConfigPda, getFreezeInstruction } from '@mosaic/ebalts';
import { EBALTS_PROGRAM_ID } from './utils';

/**
 * Generates instructions for freezing a token account.
 *
 * This function creates instructions to freeze a token account.
 *
 * @param input - Configuration parameters for freezing a token account
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.mint - The mint address of the token account
 * @param input.tokenAccount - The token account address to freeze
 * @returns Promise containing the instructions for freezing a token account
 */
export const getFreezeInstructions = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  authority: TransactionSigner<string>;
  tokenAccount: Address;
}): Promise<Instruction<string>[]> => {
  const { value: accountInfo } = await input.rpc
    .getAccountInfo(input.tokenAccount, { encoding: 'jsonParsed' })
    .send();
  if (!accountInfo) {
    throw new Error('Token account not found');
  }

  // Use jsonParsed data which works for both regular SPL and Token-2022 accounts
  if (!('parsed' in accountInfo.data) || !accountInfo.data.parsed?.info) {
    throw new Error('Failed to parse token account data');
  }

  const tokenInfo = accountInfo.data.parsed.info as {
    mint: Address;
    owner: Address;
    tokenAmount: { amount: string };
    state: string;
  };

  const token = {
    mint: tokenInfo.mint,
    owner: tokenInfo.owner,
    amount: BigInt(tokenInfo.tokenAmount.amount),
    state: tokenInfo.state,
  };

  const mintConfigPda = await findMintConfigPda(
    { mint: token.mint },
    { programAddress: EBALTS_PROGRAM_ID }
  );

  const freezeInstruction = getFreezeInstruction(
    {
      authority: input.authority,
      mintConfig: mintConfigPda[0],
      mint: token.mint,
      tokenAccount: input.tokenAccount,
    },
    { programAddress: EBALTS_PROGRAM_ID }
  );

  return [freezeInstruction];
};

/**
 * Creates a complete transaction for freezing a token account.
 *
 * This function builds a full transaction that can be signed and sent to freeze a token account.
 * The transaction includes the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can freeze the token account
 * @param input.mint - The mint address of the token account
 * @param input.tokenAccount - The token account address to freeze
 * @returns Promise containing the full transaction for freezing a token account
 */
export const getFreezeTransaction = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  payer: TransactionSigner<string>;
  authority: TransactionSigner<string>;
  tokenAccount: Address;
}): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const instructions = await getFreezeInstructions(input);
  const { value: latestBlockhash } = await input.rpc
    .getLatestBlockhash()
    .send();
  const transaction = createTransaction({
    feePayer: input.payer,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
  return transaction;
};
