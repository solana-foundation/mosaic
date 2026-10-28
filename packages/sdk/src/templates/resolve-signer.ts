import { type Address, type TransactionSigner, createNoopSigner } from '@solana/kit';

/**
 * Resolves an address-or-signer template argument to a `TransactionSigner`,
 * reusing a real signer from `others` when one has the same address.
 *
 * Kit refuses to sign a transaction that carries two distinct signer objects for
 * one address. The single-signer template call passes the mint authority as
 * `feePayer.address`, so turning that bare address into a fresh no-op signer
 * would put a no-op and the fee payer's `KeyPairSigner` in the same transaction.
 * An address with no matching signer becomes a no-op signer (it signs later).
 */
export function resolveTemplateSigner(
    value: Address | TransactionSigner<string>,
    ...others: (Address | TransactionSigner<string>)[]
): TransactionSigner<string> {
    if (typeof value !== 'string') {
        return value;
    }
    const match = others.find(
        (other): other is TransactionSigner<string> => typeof other !== 'string' && other.address === value,
    );
    return match ?? createNoopSigner(value);
}
