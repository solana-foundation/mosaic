import { transactionToB58, transactionToB64 } from '@solana/mosaic-sdk';
import type { FullTransaction } from './types.js';

type Tx = FullTransaction;

export function outputRawTransaction(encoding: string, transaction: Tx): void {
    const enc = encoding.toLowerCase();
    if (enc !== 'b64' && enc !== 'b58') {
        throw new Error("--raw-tx must be 'b64' or 'b58'");
    }
    const payload = enc === 'b64' ? transactionToB64(transaction) : transactionToB58(transaction);
    console.log(payload);
}

export function maybeOutputRawTx(rawTxOption: string | undefined, transaction: Tx): boolean {
    if (!rawTxOption) return false;
    outputRawTransaction(rawTxOption, transaction);
    return true;
}
