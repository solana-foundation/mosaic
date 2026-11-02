import { type Address, type TransactionSigner, createNoopSigner } from '@solana/kit';

type AddressOrSigner = Address | TransactionSigner<string>;

const addressOf = (value: AddressOrSigner): Address => (typeof value === 'string' ? value : value.address);

/**
 * Resolves a template's address-or-signer fee payer and mint authority to
 * `TransactionSigner`s, with exactly one signer object per address.
 *
 * Kit refuses to sign a transaction that carries two distinct signer objects for
 * one address. When the fee payer and mint authority share an address (the
 * single-signer call), both resolve to the same object: the fee payer's signer if
 * it is one, else the mint authority's, else one shared no-op signer. Otherwise
 * each resolves on its own, and a bare address becomes a no-op signer (it signs
 * later).
 */
export function resolveTemplateSigners(
    feePayer: AddressOrSigner,
    mintAuthority: AddressOrSigner,
): { feePayerSigner: TransactionSigner<string>; mintAuthoritySigner: TransactionSigner<string> } {
    const toSigner = (value: AddressOrSigner) => (typeof value === 'string' ? createNoopSigner(value) : value);
    if (addressOf(feePayer) === addressOf(mintAuthority)) {
        const signer = typeof feePayer !== 'string' ? feePayer : toSigner(mintAuthority);
        return { feePayerSigner: signer, mintAuthoritySigner: signer };
    }
    return { feePayerSigner: toSigner(feePayer), mintAuthoritySigner: toSigner(mintAuthority) };
}
