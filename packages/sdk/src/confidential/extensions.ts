import type { fetchMint, fetchToken } from '@solana-program/token-2022';

/**
 * Shared, WASM-free predicates over already-decoded (Codama) mint and token
 * accounts. The confidential operation builders each fetch the mint and/or token
 * account anyway, so they read the extension set from that decoded value rather
 * than issuing a second RPC — these helpers keep the checks in one place instead
 * of one copy per builder.
 */

export type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
export type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

/** Whether a decoded mint carries the `ConfidentialMintBurn` extension. */
export function isConfidentialMintBurn(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialMintBurn')
    );
}

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
export function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferMint')
    );
}

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
export function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return (
        token.data.extensions.__option === 'Some' &&
        token.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferAccount')
    );
}

/**
 * Whether a decoded mint carries the `ConfidentialTransferFee` extension, which
 * requires the fee-aware confidential transfer variant rather than the standard
 * one.
 */
export function mintHasConfidentialTransferFee(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferFee')
    );
}
