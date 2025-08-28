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
  TOKEN_2022_PROGRAM_ADDRESS,
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
} from 'gill/programs/token';
import {
  TOKEN_ACL_PROGRAM_ID,
  getThawPermissionlessInstructions,
} from '../token-acl';
import {
  decimalAmountToRaw,
  getMintDetails,
  isDefaultAccountStateSetFrozen,
  resolveTokenAccount,
} from '../transactionUtil';

/**
 * Creates a transaction to mint tokens to a recipient's associated token account.
 * Will create the ATA if it doesn't exist.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param recipient - The recipient's wallet address (owner of the ATA)
 * @param amount - The raw token amount (already adjusted for decimals)
 * @param mintAuthority - The mint authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for minting tokens
 */
export const createMintToTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  recipient: Address,
  amount: number,
  mintAuthority: Address | TransactionSigner<string>,
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
  const mintAuthoritySigner =
    typeof mintAuthority === 'string'
      ? createNoopSigner(mintAuthority)
      : mintAuthority;

  const { tokenAccount: destinationAta, isFrozen } = await resolveTokenAccount(
    rpc,
    recipient,
    mint
  );

  const { decimals, freezeAuthority, extensions } = await getMintDetails(
    rpc,
    mint
  );
  const enableSrfc37 =
    freezeAuthority === TOKEN_ACL_PROGRAM_ID &&
    isDefaultAccountStateSetFrozen(extensions);

  const rawAmount = decimalAmountToRaw(amount, decimals);

  const instructions = [
    // create idempotent will gracefully fail if the ata already exists. this is the gold standard!
    getCreateAssociatedTokenIdempotentInstruction({
      owner: recipient,
      mint: mint,
      ata: destinationAta,
      payer: feePayerSigner,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    }),
    ...(isFrozen && enableSrfc37
      ? await getThawPermissionlessInstructions({
          authority: mintAuthoritySigner,
          mint: mint,
          tokenAccount: destinationAta,
          tokenAccountOwner: recipient,
          rpc,
        })
      : []),
    getMintToInstruction(
      {
        mint: mint,
        mintAuthority: mintAuthority,
        token: destinationAta,
        amount: rawAmount,
      },
      {
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
      }
    ),
  ];

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
 * Gets mint information including decimals
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @returns Promise with mint information including decimals
 */
export async function getMintInfo(rpc: Rpc<SolanaRpcApi>, mint: Address) {
  const accountInfo = await rpc
    .getAccountInfo(mint, { encoding: 'base64' })
    .send();

  if (!accountInfo.value) {
    throw new Error(`Mint account ${mint} not found`);
  }

  // Parse mint data to get decimals (simplified parsing)
  // In Token-2022, decimals are at offset 44 in the mint account data
  const data = Buffer.from(accountInfo.value.data[0], 'base64');
  const decimals = data[44];

  return {
    decimals,
    data: accountInfo.value,
  };
}
