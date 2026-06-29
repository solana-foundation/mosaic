import { type Address, type InstructionPlan, type TransactionSigner, singleInstructionPlan } from '@solana/kit';
import {
    getDisableConfidentialCreditsInstruction,
    getDisableNonConfidentialCreditsInstruction,
    getEnableConfidentialCreditsInstruction,
    getEnableNonConfidentialCreditsInstruction,
} from '@solana-program/token-2022';
import { toAuthoritySigner } from './util';

/**
 * Enable/disable the credit flags on a confidential token account. These are
 * single-instruction, proof-free toggles:
 *   - **confidential credits** gate whether the account accepts *incoming
 *     confidential transfers*;
 *   - **non-confidential credits** gate whether the account accepts *incoming
 *     regular (plaintext) transfers*.
 *
 * Each builder returns a `singleInstructionPlan`; plan it with
 * {@link createConfidentialTransactionPlanner} to get a signable message.
 */
export interface CreditsInput {
    /** The confidential token account (ATA) to toggle. */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
}

export function createEnableConfidentialCreditsInstructionPlan(input: CreditsInput): InstructionPlan {
    return singleInstructionPlan(
        getEnableConfidentialCreditsInstruction({
            token: input.tokenAccount,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}

export function createDisableConfidentialCreditsInstructionPlan(input: CreditsInput): InstructionPlan {
    return singleInstructionPlan(
        getDisableConfidentialCreditsInstruction({
            token: input.tokenAccount,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}

export function createEnableNonConfidentialCreditsInstructionPlan(input: CreditsInput): InstructionPlan {
    return singleInstructionPlan(
        getEnableNonConfidentialCreditsInstruction({
            token: input.tokenAccount,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}

export function createDisableNonConfidentialCreditsInstructionPlan(input: CreditsInput): InstructionPlan {
    return singleInstructionPlan(
        getDisableNonConfidentialCreditsInstruction({
            token: input.tokenAccount,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}
