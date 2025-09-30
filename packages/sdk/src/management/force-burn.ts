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
  getBurnCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import {
  resolveTokenAccount,
  decimalAmountToRaw,
  getMintDetails,
  isDefaultAccountStateSetFrozen,
} from '../transactionUtil';
import {
  TOKEN_ACL_PROGRAM_ID,
  getThawPermissionlessInstructions,
} from '../token-acl';

/**
 * Creates a transaction to force burn tokens using the permanent delegate extension.
 * This allows the permanent delegate to burn tokens from any account regardless of approval.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The account address to burn tokens from (wallet or ATA)
 * @param decimalAmount - The decimal amount to burn (e.g., 1.5)
 * @param permanentDelegate - The permanent delegate authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for force burning tokens
 */
export const createForceBurnTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  fromAccount: Address,
  decimalAmount: number,
  permanentDelegate: Address | TransactionSigner<string>,
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
  const permanentDelegateSigner =
    typeof permanentDelegate === 'string'
      ? createNoopSigner(permanentDelegate)
      : permanentDelegate;

  // Get mint info to determine decimals
  const { decimals, freezeAuthority, extensions } = await getMintDetails(
    rpc,
    mint
  );
  const enableSrfc37 =
    freezeAuthority === TOKEN_ACL_PROGRAM_ID &&
    isDefaultAccountStateSetFrozen(extensions);

  // Convert decimal amount to raw amount
  const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

  // Resolve source token account
  const { tokenAccount: sourceTokenAccount, isFrozen } =
    await resolveTokenAccount(rpc, fromAccount, mint);

  const instructions = [];

  // Thaw the account if frozen and SRFC37 is enabled
  if (isFrozen && (enableSrfc37 ?? false)) {
    const thawInstructions = await getThawPermissionlessInstructions({
      authority: feePayerSigner,
      mint,
      tokenAccount: sourceTokenAccount,
      tokenAccountOwner: fromAccount,
      rpc,
    });
    instructions.push(...thawInstructions);
  }

  // Add force burn instruction using permanent delegate authority
  // The permanent delegate can burn tokens without approval from the owner
  instructions.push(
    getBurnCheckedInstruction(
      {
        account: sourceTokenAccount,
        mint,
        authority: permanentDelegateSigner,
        amount: rawAmount,
        decimals,
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
 * Validates that a mint has the permanent delegate extension enabled
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param permanentDelegateAddress - Expected permanent delegate address
 * @returns Promise that resolves if validation passes, throws if not
 */
export async function validatePermanentDelegateForBurn(
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  permanentDelegateAddress: Address
): Promise<void> {
  const { extensions } = await getMintDetails(rpc, mint);

  // Check if permanent delegate extension exists
  const permanentDelegateExtension = extensions.find(
    ext => 'extension' in ext && ext.extension === 'permanentDelegate'
  );

  if (!permanentDelegateExtension) {
    throw new Error(
      `Mint ${mint} does not have permanent delegate extension enabled`
    );
  }

  const delegateAddress = permanentDelegateExtension.state?.delegate;
  if (delegateAddress !== permanentDelegateAddress) {
    throw new Error(
      `Permanent delegate mismatch. Expected: ${permanentDelegateAddress}, Found: ${delegateAddress}`
    );
  }
}
