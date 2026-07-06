import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    nonDivisibleSequentialInstructionPlan,
} from '@solana/kit';
import { getEmptyConfidentialTransferAccountInstruction } from '@solana-program/token-2022';
import { SYSVAR_INSTRUCTIONS_ADDRESS } from '@solana/sysvars';
import type { ConfidentialKeys } from './keys';
import { fetchConfidentialAccountState } from './account-state';
import { buildZeroCiphertextProofIxs } from './proof';
import { toAuthoritySigner } from './util';

/**
 * Empties a confidential token account's **available** balance so it can be
 * closed: it proves (via a `ZeroCiphertext` proof) that the available balance
 * ciphertext encrypts zero, then runs `EmptyConfidentialTransferAccount`.
 *
 * Unlike the other operations there is no upstream helper, so this uses the
 * bespoke proof plumbing in `proof.ts` in **sibling mode**: the `VerifyZero`
 * proof instruction sits immediately before the token instruction in the same
 * transaction (`proofInstructionOffset = -1`). The two are returned as a
 * `nonDivisibleSequentialInstructionPlan` so the planner keeps them in one
 * transaction.
 *
 * The available balance must already be zero (run `withdraw` first); otherwise
 * the proof fails on-chain.
 */
export async function createEmptyConfidentialAccountInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    /** Pays for the (sibling) proof verification instruction. */
    payer: TransactionSigner;
    /** The confidential token account (ATA) to empty. */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** ElGamal keypair + AES key for this account. */
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const state = await fetchConfidentialAccountState(input.rpc, input.tokenAccount);
    if (!state) {
        throw new Error(`Account ${input.tokenAccount} has no ConfidentialTransferAccount extension.`);
    }

    // ZeroCiphertext proof over the available balance, verified as a sibling.
    const proof = await buildZeroCiphertextProofIxs({
        rpc: input.rpc,
        payer: input.payer,
        elgamal: input.keys.elgamal,
        ciphertext: new Uint8Array(state.ciphertexts.availableBalance),
    });

    const emptyIx = getEmptyConfidentialTransferAccountInstruction({
        token: input.tokenAccount,
        instructionsSysvarOrContextState: SYSVAR_INSTRUCTIONS_ADDRESS,
        authority: toAuthoritySigner(input.authority),
        // -1 = read the proof from the immediately-preceding sibling instruction.
        proofInstructionOffset: -1,
    });

    // `cleanup` is empty in sibling mode (the path used here), but thread it
    // through anyway so the context-account rent is never leaked if a
    // context-state proof ever flows through `buildZeroCiphertextProofIxs`.
    return nonDivisibleSequentialInstructionPlan([...proof.setup, emptyIx, ...proof.cleanup]);
}
