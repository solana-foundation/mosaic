import type {
  FullTransaction,
  TransactionVersion,
  TransactionMessageWithFeePayer,
  TransactionMessageWithBlockhashLifetime,
  Rpc,
  Address,
  SolanaRpcApi,
} from 'gill';
import { getBase58Decoder, compileTransaction, getBase64Decoder } from 'gill';
import {
  getAssociatedTokenAccountAddress,
  TOKEN_2022_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
} from 'gill/programs';

/**
 * Converts a compiled Solana transaction to a base58-encoded string.
 *
 * Note: Squads still requires base58 encoded transactions.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base58-encoded transaction as a string.
 */
export const transactionToB58 = (
  transaction: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime
  >
): string => {
  const compiledTransaction = compileTransaction(transaction);
  return getBase58Decoder().decode(compiledTransaction.messageBytes);
};

/**
 * Converts a compiled Solana transaction to a base64-encoded string.
 *
 * Base64 encoded transactions are recommended for most use cases.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base64-encoded transaction as a string.
 */
export const transactionToB64 = (
  transaction: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime
  >
): string => {
  const compiledTransaction = compileTransaction(transaction);
  return getBase64Decoder().decode(compiledTransaction.messageBytes);
};

/**
 * Converts a decimal amount to raw token amount based on mint decimals
 *
 * @param decimalAmount - The decimal amount (e.g., 1.5)
 * @param decimals - The number of decimals the token has
 * @returns The raw token amount as bigint
 */
export function decimalAmountToRaw(
  decimalAmount: number,
  decimals: number
): bigint {
  if (decimals < 0 || decimals > 9) {
    throw new Error('Decimals must be between 0 and 9');
  }

  const multiplier = Math.pow(10, decimals);
  const rawAmount = Math.floor(decimalAmount * multiplier);

  if (rawAmount < 0) {
    throw new Error('Amount must be positive');
  }

  return BigInt(rawAmount);
}

/**
 * Determines if an address is an Associated Token Account or wallet address
 * Returns the token account address to use for any operation
 * Note this function will not ensure that the account exists onchain
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
): Promise<{
  tokenAccount: Address;
  wasOwnerAddress: boolean;
  isFrozen: boolean;
}> {
  const accountInfo = await rpc
    .getAccountInfo(account, { encoding: 'jsonParsed' })
    .send();

  // Check if it's an existing token account for this mint
  if (accountInfo.value?.owner === TOKEN_2022_PROGRAM_ADDRESS) {
    const data = accountInfo.value?.data;
    if ('parsed' in data && data.parsed?.info) {
      const ataInfo = data.parsed.info as { mint: Address; state: string };
      if (ataInfo.mint === mint) {
        return {
          tokenAccount: account,
          wasOwnerAddress: false,
          isFrozen: ataInfo.state === 'frozen',
        };
      }
      throw new Error(
        `Token account ${account} is not for mint ${mint} but for ${ataInfo.mint}`
      );
    }
    throw new Error(`Unable to parse token account data for ${account}`);
  }

  // If account exists but not a valid token program account
  if (accountInfo.value && accountInfo.value.owner !== SYSTEM_PROGRAM_ADDRESS) {
    throw new Error(
      `Token account ${account} is not a valid account for mint ${mint}`
    );
  }

  // Derive ATA for wallet address
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    account,
    TOKEN_2022_PROGRAM_ADDRESS
  );
  // check if the ATA is frozen
  const ataInfo = await rpc
    .getAccountInfo(ata, { encoding: 'jsonParsed' })
    .send();
  if (
    ataInfo.value?.data &&
    'parsed' in ataInfo.value.data &&
    ataInfo.value.data.parsed?.info
  ) {
    const tokenState = (ataInfo.value?.data.parsed?.info as { state: string })
      .state;
    return {
      tokenAccount: ata,
      wasOwnerAddress: false,
      isFrozen: tokenState === 'frozen',
    };
  }

  // if the ATA doesn't exist yet, consider it frozen as it will be created through EBALTS
  return { tokenAccount: ata, wasOwnerAddress: true, isFrozen: true };
}
