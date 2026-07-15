import type { Address } from '@solana/kit';
import type { Extension, fetchMint, fetchToken } from '@solana-program/token-2022';

/**
 * Shared plumbing for the confidential **mint** and **burn** operations: pure
 * mint/account extension reads (no WASM). The proof orchestration and
 * context-state plan assembly live upstream in
 * `@solana-program/token-2022/confidential` (`getConfidentialMintInstructionPlan`
 * / `getConfidentialBurnInstructionPlan`); `mint.ts` / `burn.ts` only add the
 * Mosaic value-adds (decimal handling, fail-fast guards, the drift guard) around
 * those helpers.
 */

type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;
type ConfidentialMintBurnExtension = Extract<Extension, { __kind: 'ConfidentialMintBurn' }>;
type ConfidentialTransferAccountExtension = Extract<Extension, { __kind: 'ConfidentialTransferAccount' }>;

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
export function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferMint')
    );
}

/**
 * Reads the mint's `ConfidentialMintBurn` extension, or throws with an
 * actionable message if the mint is not configured for confidential mint/burn.
 */
export function getConfidentialMintBurnExtension(
    mint: DecodedMint,
    mintAddress: Address,
): ConfidentialMintBurnExtension {
    if (mint.data.extensions.__option === 'Some') {
        const ext = mint.data.extensions.value.find(
            (e): e is ConfidentialMintBurnExtension => e.__kind === 'ConfidentialMintBurn',
        );
        if (ext) {
            return ext;
        }
    }
    throw new Error(
        `Mint ${mintAddress} is not configured for confidential mint/burn ` +
            `(missing the ConfidentialMintBurn extension).`,
    );
}

/**
 * Reads the account's ElGamal public key from its `ConfidentialTransferAccount`
 * extension, or throws if the account is not confidential-transfer configured.
 */
export function getAccountElgamalPubkey(token: DecodedToken, tokenAccount: Address): Address {
    return getConfidentialTransferAccountExtension(token, tokenAccount).elgamalPubkey;
}

/**
 * Reads the account's `ConfidentialTransferAccount` extension (ElGamal pubkey +
 * balance ciphertexts), or throws if the account is not confidential-transfer
 * configured. `burn.ts` uses it to read the available-balance ciphertexts for the
 * pre-flight drift guard.
 */
export function getConfidentialTransferAccountExtension(
    token: DecodedToken,
    tokenAccount: Address,
): ConfidentialTransferAccountExtension {
    if (token.data.extensions.__option === 'Some') {
        const ext = token.data.extensions.value.find(
            (e): e is ConfidentialTransferAccountExtension => e.__kind === 'ConfidentialTransferAccount',
        );
        if (ext) {
            return ext;
        }
    }
    throw new Error(
        `Token account ${tokenAccount} is not configured for confidential transfers ` +
            `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
            `createConfigureConfidentialAccountInstructionPlan.`,
    );
}
