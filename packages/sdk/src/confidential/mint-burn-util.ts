import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type Instruction,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    generateKeyPairSigner,
    sequentialInstructionPlan,
} from '@solana/kit';
import type { Extension, fetchMint, fetchToken } from '@solana-program/token-2022';
import { type ProofMode, buildMintBurnProofIxs } from './proof';
import type { MintBurnProofData } from './mint-burn-proof';

/**
 * Shared plumbing for the confidential **mint** and **burn** operations: pure
 * mint/account extension reads (no WASM) and the multi-transaction context-state
 * plan assembler both `mint.ts` and `burn.ts` use.
 *
 * No published token-2022 ships confidential mint/burn `InstructionPlan` helpers,
 * so — unlike transfer/withdraw — Mosaic builds the proof data itself (see
 * `mint-burn-proof.ts`) and assembles the context-state plan here. Once the
 * upstream helpers ship in a published release, `mint.ts` / `burn.ts` can be
 * re-pointed at `@solana-program/token-2022/confidential` and this assembler +
 * `mint-burn-proof.ts` + `ciphertext-math.ts` deleted.
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
 * Reads the auditor ElGamal pubkey from the mint's `ConfidentialTransferMint`
 * extension, or `undefined` if the mint has no auditor. When a mint has an
 * auditor, every confidential mint/burn must encrypt the amount to it, so this
 * is folded into the operation automatically unless overridden.
 */
export function getMintAuditorElgamalPubkey(mint: DecodedMint): Address | undefined {
    if (mint.data.extensions.__option !== 'Some') {
        return undefined;
    }
    const ext = mint.data.extensions.value.find(
        (e): e is Extract<typeof e, { __kind: 'ConfidentialTransferMint' }> => e.__kind === 'ConfidentialTransferMint',
    );
    if (!ext || ext.auditorElgamalPubkey.__option !== 'Some') {
        return undefined;
    }
    return ext.auditorElgamalPubkey.value;
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

/** The three context-state proof records a mint/burn instruction references. */
export interface MintBurnProofRecords {
    equalityRecord: Address;
    ciphertextValidityRecord: Address;
    rangeRecord: Address;
}

/**
 * Assembles the full context-state `InstructionPlan` for a confidential mint or
 * burn: verifies the three proofs into fresh context-state accounts (setup),
 * runs the token instruction referencing them at `proofInstructionOffset = 0`,
 * then closes the accounts to reclaim rent (cleanup) — all in one divisible
 * sequential plan the planner packs across transactions (the U128 range proof
 * is too large to share a transaction with the token instruction).
 *
 * The token instruction is built via `buildTokenInstruction` once the record
 * addresses are known, so `mint.ts` / `burn.ts` supply their own discriminator
 * and account wiring.
 */
export async function assembleConfidentialMintBurnPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for (and closes) the context-state accounts. */
    payer: TransactionSigner;
    proof: MintBurnProofData;
    buildTokenInstruction: (records: MintBurnProofRecords) => Instruction;
}): Promise<InstructionPlan> {
    const [equalityContext, ciphertextValidityContext, rangeContext] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);

    const contextMode = (contextAccount: Awaited<ReturnType<typeof generateKeyPairSigner>>): ProofMode => ({
        kind: 'context-state',
        contextAccount,
        authority: input.payer,
    });

    const proofIxs = await buildMintBurnProofIxs({
        rpc: input.rpc,
        payer: input.payer,
        equality: { proofData: { toBytes: () => input.proof.equalityProofBytes }, mode: contextMode(equalityContext) },
        ciphertextValidity: {
            proofData: { toBytes: () => input.proof.ciphertextValidityProofBytes },
            mode: contextMode(ciphertextValidityContext),
        },
        range: { proofData: { toBytes: () => input.proof.rangeProofBytes }, mode: contextMode(rangeContext) },
    });

    const tokenInstruction = input.buildTokenInstruction({
        equalityRecord: equalityContext.address,
        ciphertextValidityRecord: ciphertextValidityContext.address,
        rangeRecord: rangeContext.address,
    });

    return sequentialInstructionPlan([...proofIxs.setup, tokenInstruction, ...proofIxs.cleanup]);
}
