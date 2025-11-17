import type {
    FullTransaction,
    TransactionMessageWithBlockhashLifetime,
    TransactionMessageWithFeePayer,
    TransactionVersion,
} from 'gill';
import { transactionToB58, transactionToB64 } from '@mosaic/sdk';

type Tx = FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionMessageWithBlockhashLifetime>;

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
