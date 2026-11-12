import {
    getBase58Decoder,
    getBase64EncodedWireTransaction,
    getTransactionEncoder,
    partiallySignTransactionMessageWithSigners,
} from '@solana/kit';
import type { FullTransaction } from './types.js';

type Tx = FullTransaction;

/**
 * Prints the transaction for `--raw-tx` as a base64 or base58 wire transaction.
 *
 * In raw mode the authority and fee payer are noop signers, so their signature slots stay empty
 * for the external signer to fill. A key the CLI itself holds still signs here: a generated or
 * `--mint-keypair` mint, or a `--permissioned-burn-keypair` co-signer. That key never leaves this
 * process, so without its signature the printed transaction could never be completed. When a role
 * shares its address with a held key, `resolveSigners` hands it the held signer, so that slot is
 * signed here too.
 */
export async function outputRawTransaction(encoding: string, transaction: Tx): Promise<void> {
    const enc = encoding.toLowerCase();
    if (enc !== 'b64' && enc !== 'b58') {
        throw new Error("--raw-tx must be 'b64' or 'b58'");
    }
    const partiallySigned = await partiallySignTransactionMessageWithSigners(transaction);
    const payload =
        enc === 'b64'
            ? getBase64EncodedWireTransaction(partiallySigned)
            : getBase58Decoder().decode(getTransactionEncoder().encode(partiallySigned));
    console.log(payload);
}
