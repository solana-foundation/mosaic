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
import { ABL_PROGRAM_ID } from './utils';
import { getSetupExtraMetasInstruction } from '@token-acl/abl-sdk';
import {
  findMintConfigPda,
  findThawExtraMetasAccountPda,
} from '@token-acl/sdk';
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl';

/**
 * Generates instructions for setting extra metadata thaw configuration for a token.
 *
 * This function creates instructions to configure the extra accounts metadata
 * on a specific mint, effectively assigning a specific allow / block list to a token account.
 * This is used in conjunction with the Token ACL program to permissionlessly thaw token accounts.
 *
 * @param input - Configuration parameters for setting extra metadata thaw
 * @param input.authority - The authority signer who can modify the thaw configuration
 * @param input.mint - The mint address for which to configure extra metadata thaw
 * @param input.list - The list configuration address that controls the thaw permissions
 * @returns Promise containing the instructions for setting extra metadata thaw
 */
export const getSetExtraMetasInstructions = async (input: {
  authority: TransactionSigner<string>;
  mint: Address;
  lists: Address[];
}): Promise<Instruction<string>[]> => {
  const mintConfigPda = await findMintConfigPda(
    { mint: input.mint },
    { programAddress: TOKEN_ACL_PROGRAM_ID }
  );
  const extraMetasThaw = await findThawExtraMetasAccountPda(
    { mint: input.mint },
    { programAddress: ABL_PROGRAM_ID }
  );

  const createListInstruction = getSetupExtraMetasInstruction(
    {
      authority: input.authority,
      mint: input.mint,
      tokenAclMintConfig: mintConfigPda[0],
      extraMetas: extraMetasThaw[0],
      lists: input.lists,
    },
    { programAddress: ABL_PROGRAM_ID }
  );

  return [createListInstruction];
};

/**
 * Creates a complete transaction for setting extra metadata thaw configuration for a token.
 *
 * This function builds a full transaction that can be signed and sent to configure
 * the thaw settings for extra metadata on a specific mint. The transaction includes
 * the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can modify the thaw configuration
 * @param input.mint - The mint address for which to configure extra metadata thaw
 * @param input.list - The list configuration address that controls the thaw permissions
 * @returns Promise containing the full transaction for setting extra metadata thaw
 */
export const getSetExtraMetasTransaction = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  payer: TransactionSigner<string>;
  authority: TransactionSigner<string>;
  mint: Address;
  lists: Address[];
}): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const instructions = await getSetExtraMetasInstructions(input);
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
