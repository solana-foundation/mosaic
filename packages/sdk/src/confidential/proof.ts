import type { Address, Instruction, KeyPairSigner, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import {
    ElGamalCiphertext,
    PubkeyValidityProofData,
    ZeroCiphertextProofData,
    type ElGamalKeypair,
} from '@solana/mosaic-sdk/_zk';
import {
    verifyPubkeyValidity,
    verifyZeroCiphertext,
    verifyCiphertextCommitmentEquality,
    verifyBatchedRangeProofU64,
    verifyCiphertextCiphertextEquality,
    verifyBatchedGroupedCiphertext3HandlesValidity,
    closeContextStateProof,
} from '@solana-program/zk-elgamal-proof';

/**
 * Confidential Transfer proof plumbing.
 *
 * Token-2022 confidential instructions (`configure`, `withdraw`, `transfer`,
 * `empty`, …) don't contain proofs — they *reference* proofs verified by the
 * native ZK ElGamal Proof program, either:
 *   - **sibling mode**: a `VerifyX` instruction sits next to the token instruction
 *     in the same transaction and the token instruction points at it with a
 *     signed relative `proofInstructionOffset` (e.g. `-1` = immediately before);
 *     or
 *   - **context-state mode**: the proof is verified ahead of time into a
 *     dedicated context-state account, and the token instruction reads it with
 *     `proofInstructionOffset = 0`. Required when proofs are too big to fit in
 *     one transaction (notably `transfer`, which needs three).
 *
 * This module wraps `@solana/zk-sdk` (proof *data*) and
 * `@solana-program/zk-elgamal-proof` (proof-program *instructions* +
 * context-state account management) into typed builders. It owns the
 * *instruction wiring* (mode, account creation, teardown); it does **not** set
 * the token instruction's `proofInstructionOffset` — that stays with each
 * operation, which knows where it places the proof relative to the token ix.
 *
 * Along with `keys.ts`, this is the only module that imports the WASM crypto, so
 * it can be mocked wholesale in unit tests.
 */

/** A `@solana/zk-sdk` proof-data object (or any structural stand-in for tests). */
export interface ProofData {
    toBytes(): Uint8Array;
    free?(): void;
}

/**
 * Where a single proof is verified.
 * - `sibling`: emit only the `VerifyX` instruction (no account); the operation
 *   places it next to the token ix and uses a negative `proofInstructionOffset`.
 * - `context-state`: create + verify into `contextAccount`; the operation reads
 *   it with `proofInstructionOffset = 0` and should run the returned `cleanup`
 *   afterwards to reclaim rent.
 */
export type ProofMode =
    | { kind: 'sibling' }
    | {
          kind: 'context-state';
          /** New account that will hold the verified proof context (signs its own creation). */
          contextAccount: KeyPairSigner;
          /** Authority allowed to close the context-state account and reclaim rent. */
          authority: TransactionSigner;
      };

/** Instructions produced for one (or several) proofs. */
export interface ProofInstructions {
    /**
     * Proof-program instructions. In sibling mode, the single `VerifyX` ix; in
     * context-state mode, `[createAccount, VerifyX]`. Include these before the
     * token instruction (sibling) or in a setup transaction (context-state). For
     * multi-proof operations the proofs appear in the documented order.
     */
    setup: Instruction[];
    /**
     * Instructions to close any context-state accounts and reclaim rent; run
     * after the token instruction. Empty in sibling mode.
     */
    cleanup: Instruction[];
}

/** A bridge `verifyX` action — all share this shape. */
type VerifyFn = (args: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    proofData: Uint8Array;
    contextState?: { contextAccount: KeyPairSigner; authority: Address };
    programId?: Address;
}) => Promise<Instruction[]>;

const SIBLING: ProofMode = { kind: 'sibling' };

/**
 * Core wiring: given a `verifyX` action and a proof-data object, return the
 * proof-program instructions for the requested {@link ProofMode}. Bytes are
 * extracted from `proofData` synchronously; the caller owns freeing it.
 */
export async function buildProofVerificationIxs(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    verify: VerifyFn;
    proofData: ProofData;
    mode?: ProofMode;
}): Promise<ProofInstructions> {
    const { rpc, payer, verify, proofData, mode = SIBLING } = input;
    const bytes = proofData.toBytes();

    if (mode.kind === 'context-state') {
        const setup = await verify({
            rpc,
            payer,
            proofData: bytes,
            contextState: { contextAccount: mode.contextAccount, authority: mode.authority.address },
        });
        const cleanup = [
            buildCloseContextStateInstruction({
                contextAccount: mode.contextAccount.address,
                destination: payer.address,
                authority: mode.authority,
            }),
        ];
        return { setup, cleanup };
    }

    const setup = await verify({ rpc, payer, proofData: bytes });
    return { setup, cleanup: [] };
}

/**
 * `PubkeyValidity` proof — proves the prover knows the ElGamal secret key.
 * Used by `configure-account` (and account approval). Constructs and frees the
 * proof data internally.
 */
export async function buildPubkeyValidityProofIxs(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    elgamal: ElGamalKeypair;
    mode?: ProofMode;
}): Promise<ProofInstructions> {
    const proofData = new PubkeyValidityProofData(input.elgamal);
    try {
        return await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyPubkeyValidity,
            proofData,
            mode: input.mode,
        });
    } finally {
        proofData.free();
    }
}

/**
 * `ZeroCiphertext` proof — proves an ElGamal ciphertext encrypts zero. Used by
 * `configure-account` (zero opening balance) and `empty-account` (available
 * balance is zero before close).
 *
 * @param ciphertext - 64-byte ElGamal ciphertext to prove is zero.
 */
export async function buildZeroCiphertextProofIxs(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    elgamal: ElGamalKeypair;
    ciphertext: Uint8Array;
    mode?: ProofMode;
}): Promise<ProofInstructions> {
    const ciphertext = ElGamalCiphertext.fromBytes(input.ciphertext);
    if (!ciphertext) {
        throw new Error('Failed to decode ElGamal ciphertext (expected 64 bytes).');
    }
    const proofData = new ZeroCiphertextProofData(input.elgamal, ciphertext);
    try {
        return await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyZeroCiphertext,
            proofData,
            mode: input.mode,
        });
    } finally {
        proofData.free();
        ciphertext.free?.();
    }
}

/**
 * A proof plus where to verify it. Used by the multi-proof builders so each
 * proof can be sibling or context-state with its own context account.
 */
export interface ProofWithMode {
    proofData: ProofData;
    mode?: ProofMode;
}

/**
 * `withdraw` proofs: a `CiphertextCommitmentEquality` proof and a
 * `BatchedRangeProofU64` proof, emitted in that order. The proof data is built
 * by the withdraw operation (it depends on the withdrawal amount and the
 * account's available balance); this only wires the instructions.
 */
export async function buildWithdrawProofIxs(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    equality: ProofWithMode;
    range: ProofWithMode;
}): Promise<ProofInstructions> {
    return concatProofInstructions([
        await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyCiphertextCommitmentEquality,
            proofData: input.equality.proofData,
            mode: input.equality.mode,
        }),
        await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyBatchedRangeProofU64,
            proofData: input.range.proofData,
            mode: input.range.mode,
        }),
    ]);
}

/**
 * `transfer` proofs: `CiphertextCiphertextEquality`,
 * `BatchedGroupedCiphertext3HandlesValidity`, and `BatchedRangeProofU64`,
 * emitted in that order. Three proofs do not fit in one transaction, so callers
 * should use context-state mode for each. The proof data is built by the
 * transfer operation.
 */
export async function buildTransferProofIxs(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    equality: ProofWithMode;
    ciphertextValidity: ProofWithMode;
    range: ProofWithMode;
}): Promise<ProofInstructions> {
    return concatProofInstructions([
        await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyCiphertextCiphertextEquality,
            proofData: input.equality.proofData,
            mode: input.equality.mode,
        }),
        await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyBatchedGroupedCiphertext3HandlesValidity,
            proofData: input.ciphertextValidity.proofData,
            mode: input.ciphertextValidity.mode,
        }),
        await buildProofVerificationIxs({
            rpc: input.rpc,
            payer: input.payer,
            verify: verifyBatchedRangeProofU64,
            proofData: input.range.proofData,
            mode: input.range.mode,
        }),
    ]);
}

/**
 * Closes a context-state account and returns its rent to `destination`. Run
 * after the token instruction in context-state mode.
 */
export function buildCloseContextStateInstruction(input: {
    contextAccount: Address;
    destination: Address;
    authority: TransactionSigner;
}): Instruction {
    return closeContextStateProof({
        contextState: input.contextAccount,
        authority: input.authority,
        destination: input.destination,
    });
}

/** Concatenates several {@link ProofInstructions}, preserving setup order. */
function concatProofInstructions(parts: ProofInstructions[]): ProofInstructions {
    return {
        setup: parts.flatMap(p => p.setup),
        cleanup: parts.flatMap(p => p.cleanup),
    };
}
