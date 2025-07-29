import type {
  FullTransaction,
  TransactionVersion,
  TransactionMessageWithFeePayer,
  TransactionMessageWithBlockhashLifetime,
} from 'gill';
import { getBase58Decoder, compileTransaction, getBase64Decoder } from 'gill';

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
