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

/**
 * Throws unless a decoded token account holds `mint`. The confidential withdraw
 * and transfer plans create rent-paying proof accounts in their first
 * transactions, before the instruction that would reject a wrong-mint account,
 * and their cleanup never runs after that failure, so the builders check this up
 * front instead of stranding the rent.
 *
 * @param context - The account being checked, for the error message (e.g. `source token account <address>`).
 */
export function assertTokenAccountMint(token: DecodedToken, mint: Address, context: string): void {
    if (token.data.mint !== mint) {
        throw new Error(
            `The ${context} holds mint ${token.data.mint}, not the requested mint ${mint}. ` +
                `Pass a token account of mint ${mint}, or pass ${token.data.mint} as the mint.`,
        );
    }
}

/**
 * Throws unless a decoded token account is owned by `authority`. Token-2022 only
 * accepts the account owner (a multisig owner signs as the multisig account's
 * address) as the authority of a confidential withdraw or transfer, never a
 * delegate; checked up front for the same stranded-rent reason as
 * {@link assertTokenAccountMint}.
 *
 * @param context - The account being checked, for the error message (e.g. `source token account <address>`).
 */
export function assertTokenAccountOwner(token: DecodedToken, authority: Address, context: string): void {
    if (token.data.owner !== authority) {
        throw new Error(
            `The ${context} is owned by ${token.data.owner}, not the authority ${authority}. ` +
                `Token-2022 accepts only the account owner as the authority here, not a delegate: ` +
                `pass ${token.data.owner} as the authority, or a token account that ${authority} owns.`,
        );
    }
}
