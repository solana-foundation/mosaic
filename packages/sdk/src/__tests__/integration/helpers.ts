import type {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionWithBlockhashLifetime,
  FullTransaction,
  Commitment,
  Signature,
} from 'gill';
import {
  getSignatureFromTransaction,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
} from 'gill';
import type { Client } from './setup';
import {
  getAssociatedTokenAccountAddress,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs';

export const describeSkipIf = (condition?: boolean) =>
  condition ? describe.skip : describe;

/**
 * Submit a transaction and wait for confirmation
 */
export async function sendAndConfirmTransaction(
  client: Client,
  tx: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >,
  commitment: Commitment = 'confirmed',
  skipPreflight = true
): Promise<Signature> {
  const { rpc } = client;

  // Sign transaction
  const signedTransaction = await signTransactionMessageWithSigners(tx);

  // Get signature and wire transaction
  const signature = getSignatureFromTransaction(signedTransaction);
  await sendAndConfirmTransactionFactory(client)(signedTransaction, {
    commitment,
    skipPreflight,
  });

  return signature;
}

/**
 * Get token balance for a wallet
 */
export async function getBalance(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address,
  mint: Address
): Promise<bigint> {
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    wallet,
    TOKEN_2022_PROGRAM_ADDRESS
  );

  const accountInfo = await rpc
    .getAccountInfo(ata, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo?.value?.data) {
    return 0n;
  }

  const parsed = (accountInfo.value.data as any).parsed?.info;
  return BigInt(parsed?.tokenAmount?.amount ?? '0');
}

/**
 * Check if an account is frozen
 */
export async function isAccountFrozen(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address,
  mint: Address
): Promise<boolean> {
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    wallet,
    TOKEN_2022_PROGRAM_ADDRESS
  );

  const accountInfo = await rpc
    .getAccountInfo(ata, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo?.value?.data) {
    return false;
  }

  const parsed = (accountInfo.value.data as any).parsed?.info;
  return parsed?.state === 'frozen';
}

/**
 * Assert transaction succeeded
 */
export function assertTxSuccess(signature: string): void {
  expect(signature).toBeDefined();
  expect(typeof signature).toBe('string');
  expect(signature.length).toBeGreaterThan(0);
}

/**
 * Assert transaction fails
 */
export async function assertTxFailure(
  client: Client,
  transactionToThrow: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
): Promise<void> {
  await expect(
    sendAndConfirmTransaction(client, transactionToThrow)
  ).rejects.toThrow();
}
