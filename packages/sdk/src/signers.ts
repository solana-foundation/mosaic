import { type Address, type TransactionSigner, createNoopSigner } from '@solana/kit';

/** An account given either as a bare address or as a signer. */
export type AddressOrSigner = Address | TransactionSigner<string>;

/** The address of an {@link AddressOrSigner}. */
export function addressOf(value: AddressOrSigner): Address {
    return typeof value === 'string' ? value : value.address;
}

/**
 * Normalizes an address-or-signer into a `TransactionSigner`. A bare address
 * becomes a no-op signer (the caller signs later); an existing signer is returned
 * unchanged.
 */
export function toSigner(value: AddressOrSigner): TransactionSigner<string> {
    return typeof value === 'string' ? createNoopSigner(value) : value;
}

/**
 * The one signer object a fee payer and an authority must share when they have
 * the same address, or `undefined` when their addresses differ.
 *
 * Kit refuses to sign a transaction that carries two distinct signer objects for
 * one address. So when the authority is the fee payer's key, given as a bare
 * address or as a different signer object for it (e.g. a no-op signer next to a
 * wallet's), both resolve to the same object: the fee payer's signer if it is
 * one, else the authority's, else one shared no-op signer.
 */
export function getSharedFeePayerSigner(
    feePayer: AddressOrSigner,
    authority: AddressOrSigner,
): TransactionSigner<string> | undefined {
    if (addressOf(feePayer) !== addressOf(authority)) {
        return undefined;
    }
    return typeof feePayer === 'string' ? toSigner(authority) : feePayer;
}

/**
 * Resolves a fee payer and an authority, either of which may be a bare address,
 * to signers with exactly one signer object per address. When they share an
 * address both get the {@link getSharedFeePayerSigner} object; otherwise each
 * resolves on its own via {@link toSigner}.
 */
export function resolveFeePayerAndAuthority(
    feePayer: AddressOrSigner,
    authority: AddressOrSigner,
): { feePayerSigner: TransactionSigner<string>; authoritySigner: TransactionSigner<string> } {
    const shared = getSharedFeePayerSigner(feePayer, authority);
    if (shared) {
        return { feePayerSigner: shared, authoritySigner: shared };
    }
    return { feePayerSigner: toSigner(feePayer), authoritySigner: toSigner(authority) };
}
