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
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { resolveTokenAccount, decimalAmountToRaw } from '../transactionUtil';
import { getThawPermissionlessInstructions } from '../ebalts';

/**
 * Gets mint information including decimals from the blockchain
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @returns Promise with mint information including decimals
 */
async function getMintInfo(rpc: Rpc<SolanaRpcApi>, mint: Address) {
  const accountInfo = await rpc
    .getAccountInfo(mint, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo.value) {
    throw new Error(`Mint account ${mint} not found`);
  }

  const data = accountInfo.value.data;
  if (!('parsed' in data) || !data.parsed?.info) {
    throw new Error(`Unable to parse mint data for ${mint}`);
  }

  const mintInfo = data.parsed.info as {
    decimals: number;
    freezeAuthority?: string;
    mintAuthority?: string;
    extensions?: any[];
  };

  return {
    decimals: mintInfo.decimals,
    freezeAuthority: mintInfo.freezeAuthority,
    mintAuthority: mintInfo.mintAuthority,
    extensions: mintInfo.extensions || [],
  };
}

/**
 * Creates a transaction to force transfer tokens using the permanent delegate extension.
 * This allows the permanent delegate to transfer tokens from any account regardless of approval.
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param fromAccount - The source account address (wallet or ATA)
 * @param toAccount - The destination account address (wallet or ATA)
 * @param decimalAmount - The decimal amount to transfer (e.g., 1.5)
 * @param permanentDelegate - The permanent delegate authority signer
 * @param feePayer - The fee payer signer
 * @returns A promise that resolves to a FullTransaction object for force transferring tokens
 */
export const createForceTransferTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  fromAccount: Address,
  toAccount: Address,
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
  const mintInfo = await getMintInfo(rpc, mint);
  const decimals = mintInfo.decimals;

  // Convert decimal amount to raw amount
  const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

  // Resolve source and destination token accounts
  const { tokenAccount: sourceTokenAccount } = await resolveTokenAccount(
    rpc,
    fromAccount,
    mint
  );
  const {
    tokenAccount: destTokenAccount,
    wasOwnerAddress: destWasOwner,
    isFrozen,
  } = await resolveTokenAccount(rpc, toAccount, mint);

  const instructions = [];

  // Create destination ATA if needed (from wallet address)
  if (destWasOwner) {
    instructions.push(
      getCreateAssociatedTokenIdempotentInstruction({
        payer: feePayerSigner,
        ata: destTokenAccount,
        owner: toAccount,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      }),
      ...(isFrozen ? await getThawPermissionlessInstructions({
        authority: feePayerSigner,
        mint,
        tokenAccount: destTokenAccount,
              tokenAccountOwner: toAccount,
              rpc,
            })
          : []),
    );
  }

  // Add force transfer instruction using permanent delegate authority
  // The permanent delegate can transfer tokens without approval from the owner
  instructions.push(
    getTransferCheckedInstruction(
      {
        source: sourceTokenAccount,
        mint,
        destination: destTokenAccount,
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
export async function validatePermanentDelegate(
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  permanentDelegateAddress: Address
): Promise<void> {
  const mintInfo = await getMintInfo(rpc, mint);

  // Check if permanent delegate extension exists
  const permanentDelegateExtension = mintInfo.extensions.find(
    (ext: any) => ext.extension === 'permanentDelegate'
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
