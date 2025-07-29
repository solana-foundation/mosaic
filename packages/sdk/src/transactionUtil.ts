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
) => {
  const compiledTransaction = compileTransaction(transaction);
  const base58Decoder = getBase58Decoder();
  return base58Decoder.decode(compiledTransaction.messageBytes);
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
) => {
  const compiledTransaction = compileTransaction(transaction);
  const base64Decoder = getBase64Decoder();
  return base64Decoder.decode(compiledTransaction.messageBytes);
};
