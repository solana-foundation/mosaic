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
 * Resolves accounts, each given as a bare address or as a signer, to signers with
 * exactly one signer object per address, in the order given.
 *
 * Kit refuses to sign a transaction that carries two distinct signer objects for
 * one address (two no-op signers for it count as one). So every role on one key
 * gets the same object: the first real signer given for that address, else the
 * first no-op signer given for it, else one no-op signer shared by every bare
 * address for it. A real signer wins over a no-op one whichever role it was given
 * in, so the key never ends up with an empty signature.
 */
export function resolveSigners<const T extends readonly AddressOrSigner[]>(
    ...values: T
): { [K in keyof T]: TransactionSigner<string> } {
    const chosen = new Map<Address, TransactionSigner<string>>();
    for (const value of values) {
        if (typeof value === 'string') {
            continue;
        }
        const current = chosen.get(value.address);
        if (!current || (isNoopSigner(current) && !isNoopSigner(value))) {
            chosen.set(value.address, value);
        }
    }
    return values.map(value => {
        const address = addressOf(value);
        let signer = chosen.get(address);
        if (!signer) {
            signer = createNoopSigner(address);
            chosen.set(address, signer);
        }
        return signer;
    }) as { [K in keyof T]: TransactionSigner<string> };
}

/**
 * The one signer object a fee payer and an authority must share when they have
 * the same address, or `undefined` when their addresses differ. See
 * {@link resolveSigners} for which object wins; on a tie the fee payer's does.
 */
export function getSharedFeePayerSigner(
    feePayer: AddressOrSigner,
    authority: AddressOrSigner,
): TransactionSigner<string> | undefined {
    if (addressOf(feePayer) !== addressOf(authority)) {
        return undefined;
    }
    return resolveSigners(feePayer, authority)[0];
}

/**
 * Resolves a fee payer and an authority, either of which may be a bare address,
 * to signers with exactly one signer object per address (see {@link resolveSigners}).
 */
export function resolveFeePayerAndAuthority(
    feePayer: AddressOrSigner,
    authority: AddressOrSigner,
): { feePayerSigner: TransactionSigner<string>; authoritySigner: TransactionSigner<string> } {
    const [feePayerSigner, authoritySigner] = resolveSigners(feePayer, authority);
    return { feePayerSigner, authoritySigner };
}
