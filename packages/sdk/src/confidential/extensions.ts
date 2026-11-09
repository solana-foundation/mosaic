import type { Address } from '@solana/kit';
import type { Extension, fetchMint, fetchToken } from '@solana-program/token-2022';

/**
 * Shared, WASM-free predicates over already-decoded (Codama) mint and token
 * accounts. The confidential operation builders each fetch the mint and/or token
 * account anyway, so they read the extension set from that decoded value rather
 * than issuing a second RPC — these helpers keep the checks in one place instead
 * of one copy per builder.
 */

export type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
export type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

type ExtensionKind = Extension['__kind'];
type ExtensionOfKind<K extends ExtensionKind> = Extract<Extension, { __kind: K }>;

/** The extension of the given kind on a decoded mint or token account, if it has one. */
function findExtension<K extends ExtensionKind>(
    account: DecodedMint | DecodedToken,
    kind: K,
): ExtensionOfKind<K> | undefined {
    if (account.data.extensions.__option !== 'Some') {
        return undefined;
    }
    return account.data.extensions.value.find((e): e is ExtensionOfKind<K> => e.__kind === kind);
}

/** Whether a decoded mint or token account carries an extension of the given kind. */
function hasExtension(account: DecodedMint | DecodedToken, kind: ExtensionKind): boolean {
    return findExtension(account, kind) !== undefined;
}

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
export function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return hasExtension(mint, 'ConfidentialTransferMint');
}

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
export function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return hasExtension(token, 'ConfidentialTransferAccount');
}

/**
 * The registered ElGamal public key a decoded token account's confidential
 * balances are encrypted under, or `null` if it has no `ConfidentialTransferAccount`
 * extension. Used to catch a caller's `ConfidentialKeys` no longer matching what
 * the account was configured with (e.g. after the zk-sdk 0.5.x key-derivation
 * change) before attempting to decrypt or build a proof with them.
 */
export function getConfidentialTransferAccountElgamalPubkey(token: DecodedToken): Address | null {
    return findExtension(token, 'ConfidentialTransferAccount')?.elgamalPubkey ?? null;
}

/**
 * Whether a decoded mint carries the `ConfidentialTransferFee` extension (the
 * withdraw-withheld authority's ElGamal key for confidentially withheld fees).
 */
export function mintHasConfidentialTransferFee(mint: DecodedMint): boolean {
    return hasExtension(mint, 'ConfidentialTransferFee');
}

/**
 * Whether a decoded mint carries the `TransferFeeConfig` extension. On a
 * confidential mint this is what makes Token-2022 require the fee-aware
 * `TransferWithFee` instruction: the program refuses to create a mint with
 * `TransferFeeConfig` + `ConfidentialTransferMint` but no
 * `ConfidentialTransferFee`, so a confidential mint with a fee config always
 * has both.
 */
export function mintHasTransferFeeConfig(mint: DecodedMint): boolean {
    return getMintTransferFeeConfig(mint) !== undefined;
}

/** A decoded mint's `TransferFeeConfig` extension (both fee schedules), if it has one. */
export function getMintTransferFeeConfig(mint: DecodedMint): ExtensionOfKind<'TransferFeeConfig'> | undefined {
    return findExtension(mint, 'TransferFeeConfig');
}
