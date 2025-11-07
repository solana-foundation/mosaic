import {
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
  type FullTransaction,
  type TransactionMessageWithFeePayer,
  type TransactionVersion,
  type TransactionWithBlockhashLifetime,
  createTransaction,
  createNoopSigner,
} from 'gill';
import {
  decimalAmountToRaw,
  resolveTokenAccount,
  getMintDetails,
  isDefaultAccountStateSetFrozen,
} from '../transactionUtil';
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { getAddMemoInstruction } from 'gill/programs';
import {
  getThawPermissionlessInstructions,
  TOKEN_ACL_PROGRAM_ID,
} from '../token-acl';

/**
 * Creates a list of instructions to transfer SPL tokens (Token-2022) from one account to another.
 * This function:
 *   - Validates and parses the transfer amount.
 *   - Fetches mint details to determine decimals and extension state.
 *   - Resolves the sender's and recipient's token accounts.
 *   - Optionally creates the recipient's associated token account if it does not exist.
 *   - Optionally thaws the recipient's account if it is frozen and SRFC-37 is enabled.
 *   - Optionally adds a memo instruction.
 *   - Appends the transferChecked instruction for the actual token transfer.
 *
 * @param input - Object containing:
 *   - rpc: Solana RPC client instance
 *   - mint: Token mint address
 *   - from: Source wallet address
 *   - to: Destination wallet address
 *   - feePayer: Signer paying transaction fees
 *   - authority: Signer authorized to transfer tokens
 *   - amount: Amount to transfer (as a string, decimal format)
 *   - memo: Optional memo string
 * @returns Promise resolving to an array of transaction instructions for the transfer
 */
export const createTransferInstructions = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  mint: Address;
  from: Address;
  to: Address;
  feePayer: TransactionSigner<string>;
  authority: TransactionSigner<string>;
  amount: string;
  memo?: string;
}) => {
  const { rpc, mint, from, to, amount, feePayer, authority, memo } = input;
  // Parse and validate amount
  const decimalAmount = parseFloat(amount);
  if (isNaN(decimalAmount) || decimalAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }

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

  // Resolve sender's token account
  const senderTokenAccountInfo = await resolveTokenAccount(
    rpc,
    from,
    mint as Address
  );

  // Resolve recipient's token account
  const recipientTokenAccountInfo = await resolveTokenAccount(rpc, to, mint);

  // Build transaction
  const instructions = [];

  // Create ATA for recipient if needed (idempotent)
  if (!recipientTokenAccountInfo.isInitialized) {
    instructions.push(
      getCreateAssociatedTokenIdempotentInstruction({
        ata: recipientTokenAccountInfo.tokenAccount,
        owner: to,
        mint: mint,
        payer: feePayer,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      })
    );
  }
  if (recipientTokenAccountInfo.isFrozen && enableSrfc37) {
    instructions.push(
      ...(await getThawPermissionlessInstructions({
        authority,
        mint: mint,
        tokenAccount: recipientTokenAccountInfo.tokenAccount,
        tokenAccountOwner: to,
        rpc,
      }))
    );
  }
  if (memo) {
    instructions.push(getAddMemoInstruction({ memo }));
  }

  // Add transfer instruction
  instructions.push(
    getTransferCheckedInstruction(
      {
        source: senderTokenAccountInfo.tokenAccount,
        destination: recipientTokenAccountInfo.tokenAccount,
        mint: mint,
        authority,
        amount: rawAmount,
        decimals,
      },
      {
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
      }
    )
  );
  return instructions;
};

/**
 * Creates a transaction to transfer SPL tokens (Token-2022) from one account to another.
 * This is a convenience wrapper around createTransferInstructions that returns a ready-to-sign transaction.
 *
 * @param input - Object containing:
 *   - rpc: Solana RPC client instance
 *   - mint: Token mint address
 *   - from: Source wallet address
 *   - to: Destination wallet address
 *   - feePayer: Signer paying transaction fees
 *   - authority: Signer authorized to transfer tokens
 *   - amount: Amount to transfer (as a string, decimal format)
 *   - memo: Optional memo string
 * @returns Promise resolving to a FullTransaction object ready for signing
 */
export const createTransferTransaction = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  mint: Address;
  from: Address;
  to: Address;
  feePayer: Address | TransactionSigner<string>;
  authority: Address | TransactionSigner<string>;
  amount: string;
  memo?: string;
}): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const feePayerSigner =
    typeof input.feePayer === 'string'
      ? createNoopSigner(input.feePayer)
      : input.feePayer;
  const authoritySigner =
    typeof input.authority === 'string'
      ? createNoopSigner(input.authority)
      : input.authority;

  const instructions = await createTransferInstructions({
    ...input,
    feePayer: feePayerSigner,
    authority: authoritySigner,
  });

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await input.rpc
    .getLatestBlockhash()
    .send();

  return createTransaction({
    feePayer: feePayerSigner,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};
