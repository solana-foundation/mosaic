import ora, { type Ora } from 'ora';
import type { Command, OptionValues } from 'commander';
import type {
  FullTransaction,
  TransactionMessageWithBlockhashLifetime,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  SendAndConfirmTransactionWithSignersFunction,
} from 'gill';
import { signTransactionMessageWithSigners } from 'gill';
import { maybeOutputRawTx } from './rawTx.js';

type Tx = FullTransaction<
  TransactionVersion,
  TransactionMessageWithFeePayer,
  TransactionMessageWithBlockhashLifetime
>;

export function getGlobalOpts(command: Command): OptionValues {
  // Safely attempts parent->parent then parent; falls back to empty object
  const parentParent = command.parent?.parent?.opts?.();
  if (parentParent) return parentParent;
  const parent = command.parent?.opts?.();
  return parent || {};
}

export function createSpinner(text: string, rawTx?: string) {
  return ora({ text, isSilent: rawTx !== undefined }).start();
}

export async function sendOrOutputTransaction(
  transaction: Tx,
  rawTx: string | undefined,
  spinner: Ora,
  sendAndConfirmTransaction: SendAndConfirmTransactionWithSignersFunction
): Promise<{ raw: boolean; signature?: string }> {
  if (maybeOutputRawTx(rawTx, transaction)) {
    return { raw: true };
  }
  spinner.text = 'Signing transaction...';
  const signed = await signTransactionMessageWithSigners(transaction);
  spinner.text = 'Sending transaction...';
  const signature = await sendAndConfirmTransaction(signed, {
    skipPreflight: true,
    commitment: 'confirmed',
  });
  return { raw: false, signature };
}
