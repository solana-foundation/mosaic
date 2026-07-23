import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { getApproveConfidentialTransferAccountInstruction } from '@solana-program/token-2022';
import { getCreateConfidentialTransferAccountInstructionPlan } from '@solana-program/token-2022/confidential';
import type { ConfidentialKeys } from './keys';

/**
 * Configures an associated token account for confidential transfers. Wraps the
 * official `getCreateConfidentialTransferAccountInstructionPlan`, which returns a
 * single-transaction plan that creates the ATA, reallocates it for the
 * `ConfidentialTransferAccount` extension, configures it under the supplied
 * ElGamal/AES keys, and verifies the required pubkey-validity proof.
 *
 * Must run before deposit/apply/withdraw/transfer can touch the account. If the
 * mint uses the **manual-approve** (whitelist) policy, the account stays
 * unusable until the confidential authority approves it via
 * {@link createApproveConfidentialAccountInstructionPlan}.
 */
export async function createConfigureConfidentialAccountInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for account creation / rent. */
    payer: TransactionSigner;
    /** The token account owner. */
    owner: Address | TransactionSigner;
    /** The token mint. */
    mint: Address;
    /** ElGamal keypair + AES key the balances will be encrypted under. */
    keys: ConfidentialKeys;
    /** Explicit token account address; defaults to the owner's ATA. */
    token?: Address;
    /** Max pending credits before `ApplyPendingBalance` must be run. */
    maximumPendingBalanceCreditCounter?: number | bigint;
}): Promise<InstructionPlan> {
    return getCreateConfidentialTransferAccountInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        owner: input.owner,
        mint: input.mint,
        token: input.token,
        elgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
        maximumPendingBalanceCreditCounter: input.maximumPendingBalanceCreditCounter,
    });
}

/**
 * Approves a configured confidential account (manual-approve / whitelist mints).
 * Signed by the mint's confidential-transfer authority. Returns a
 * `singleInstructionPlan`.
 */
export function createApproveConfidentialAccountInstructionPlan(input: {
    /** The confidential token account to approve. */
    tokenAccount: Address;
    /** The token mint. */
    mint: Address;
    /** The mint's confidential-transfer authority (must sign). */
    authority: TransactionSigner;
}): InstructionPlan {
    return singleInstructionPlan(
        getApproveConfidentialTransferAccountInstruction({
            token: input.tokenAccount,
            mint: input.mint,
            authority: input.authority,
        }),
    );
}
