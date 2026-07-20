import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { getConfidentialDepositInstruction } from '@solana-program/token-2022';
import { type TokenAmount, resolveRawAmount, toAuthoritySigner } from './util';

/**
 * Deposits tokens from the account's **non-confidential** (plaintext) balance
 * into its **pending confidential** balance. No proof is required — the source
 * amount is public. After depositing, run `apply-pending-balance` to move the
 * credited amount into the available confidential balance.
 *
 * Returns a `singleInstructionPlan`; plan it with
 * {@link createConfidentialTransactionPlanner} to get a signable message.
 */
export async function createConfidentialDepositInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    /** The token mint (used to resolve decimals). */
    mint: Address;
    /** The confidential token account (ATA) to deposit into. */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to deposit — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
}): Promise<InstructionPlan> {
    const { rawAmount, decimals } = await resolveRawAmount(input.rpc, input.mint, input.amount);
    return singleInstructionPlan(
        getConfidentialDepositInstruction({
            token: input.tokenAccount,
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
            amount: rawAmount,
            decimals,
        }),
    );
}
