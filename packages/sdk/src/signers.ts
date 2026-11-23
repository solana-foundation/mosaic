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

const NOOP_SIGNER_KEYS = ['address', 'signMessages', 'signTransactions'];

/**
 * Whether a signer has the shape of Kit's `createNoopSigner` result: a frozen
 * object with exactly `address`, `signMessages` and `signTransactions`. A key pair
 * signer also carries `keyPair`, and wallet signers expose modifying or sending
 * methods, so neither matches.
 */
function isNoopSigner(signer: TransactionSigner<string>): boolean {
    if (!Object.isFrozen(signer)) {
        return false;
    }
    const keys = Object.keys(signer);
    return keys.length === NOOP_SIGNER_KEYS.length && NOOP_SIGNER_KEYS.every(key => keys.includes(key));
}

/**
 * The one signer object a fee payer and an authority must share when they have
 * the same address, or `undefined` when their addresses differ.
 *
 * Kit refuses to sign a transaction that carries two distinct signer objects for
 * one address. So when the authority is the fee payer's key, given as a bare
 * address or as a different signer object for it (e.g. a no-op signer next to a
 * wallet's), both resolve to the same object. A real signer wins over a no-op
 * one, whichever role it was given in, so the key never ends up with an empty
 * signature. Otherwise the fee payer's signer wins if it is one, else the
 * authority's, else one shared no-op signer.
 */
export function getSharedFeePayerSigner(
    feePayer: AddressOrSigner,
    authority: AddressOrSigner,
): TransactionSigner<string> | undefined {
    if (addressOf(feePayer) !== addressOf(authority)) {
        return undefined;
    }
    if (typeof feePayer === 'string') {
        return toSigner(authority);
    }
    if (typeof authority !== 'string' && isNoopSigner(feePayer) && !isNoopSigner(authority)) {
        return authority;
    }
    return feePayer;
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
