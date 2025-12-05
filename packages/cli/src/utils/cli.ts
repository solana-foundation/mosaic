import ora, { type Ora } from 'ora';
import type { Command, OptionValues } from 'commander';
import type {
    Transaction,
    TransactionWithBlockhashLifetime,
    FullySignedTransaction,
    TransactionWithinSizeLimit,
    Commitment,
} from '@solana/kit';
import {
    signTransactionMessageWithSigners,
    getSignatureFromTransaction,
    assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';
import { maybeOutputRawTx } from './raw-tx.js';
import type { FullTransaction } from './types.js';

type Tx = FullTransaction;

// Type for the transaction expected by sendAndConfirmTransaction
type SendableTx = FullySignedTransaction & Transaction & TransactionWithBlockhashLifetime & TransactionWithinSizeLimit;

// Type for sendAndConfirmTransaction function from factory
type SendAndConfirmFn = (
    transaction: SendableTx,
    config: { commitment: Commitment; skipPreflight?: boolean },
) => Promise<void>;

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
    sendFn: SendAndConfirmFn,
): Promise<{ raw: boolean; signature?: string }> {
    if (maybeOutputRawTx(rawTx, transaction)) {
        return { raw: true };
    }
    spinner.text = 'Signing transaction...';
    const signed = await signTransactionMessageWithSigners(transaction);
    spinner.text = 'Sending transaction...';

    // Assert the transaction has blockhash lifetime for sendAndConfirmTransaction
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendFn(signed as SendableTx, { commitment: 'confirmed' });
    const signature = getSignatureFromTransaction(signed);
    return { raw: false, signature };
}
