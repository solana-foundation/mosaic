import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { getConfidentialDepositInstruction } from '@solana-program/token-2022';
import { confidentialMintBurnConversionError, mintHasConfidentialMintBurnExtension } from '../transaction-util.js';
import { type TokenAmount, resolveRawAmount, toAuthoritySigner } from './util.js';

/**
 * Deposits tokens from the account's **non-confidential** (plaintext) balance
 * into its **pending confidential** balance. No proof is required — the source
 * amount is public. After depositing, run `apply-pending-balance` to move the
 * credited amount into the available confidential balance.
 *
 * Not available on a `ConfidentialMintBurn` mint: Token-2022 rejects
 * `ConfidentialDeposit` on such a mint with `IllegalMintBurnConversion`, because
 * its supply is only ever encrypted and has no plaintext side to deposit from.
 * Supply reaches a confidential balance there via
 * `createConfidentialMintInstructionPlan` instead; this builder fails fast rather
 * than emitting a transaction the chain would reject.
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
    const { rawAmount, decimals, extensions } = await resolveRawAmount(input.rpc, input.mint, input.amount);

    if (mintHasConfidentialMintBurnExtension(extensions)) {
        throw confidentialMintBurnConversionError(input.mint, 'confidential deposit', null);
    }

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
