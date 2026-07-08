import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { fetchMint, getApplyConfidentialPendingBurnInstruction, getConfidentialBurnInstruction } from '@solana-program/token-2022';
import type { ConfidentialKeys } from './keys';
import { fetchConfidentialAccountState } from './account-state';
import { buildBurnProofData } from './mint-burn-proof';
import {
    assembleConfidentialMintBurnPlan,
    getConfidentialMintBurnExtension,
    getMintAuditorElgamalPubkey,
} from './mint-burn-util';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

/**
 * Confidentially **burns** tokens from an account's available confidential
 * balance, decreasing the mint's encrypted total supply (recorded in the mint's
 * `pending_burn` accumulator until {@link createApplyConfidentialPendingBurnInstructionPlan}
 * is run). The burn amount stays encrypted on-chain.
 *
 * Like confidential mint, there is no upstream helper: this generates the three
 * proofs (equality, grouped-ciphertext validity, U128 range) and wires them via
 * context-state accounts, so the plan spans multiple transactions (proof setup →
 * burn → cleanup). Authored by the **account owner** (who holds the account
 * keys); the mint's supply pubkey + auditor are read from the mint.
 *
 * The account's current available balance is read and decrypted with the
 * account's AES key. Fails fast if the mint lacks `ConfidentialMintBurn` or the
 * account is not confidential-transfer configured.
 */
export async function createConfidentialBurnInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The source confidential token account to burn from. */
    tokenAccount: Address;
    /** The account owner. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to burn — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
    /** The account owner's ElGamal keypair + AES key. */
    keys: ConfidentialKeys;
    /** Override the auditor pubkey; defaults to the mint's configured auditor. */
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan> {
    const [mintDecoded, state] = await Promise.all([
        fetchMint(input.rpc, input.mint),
        fetchConfidentialAccountState(input.rpc, input.tokenAccount, { keys: input.keys }),
    ]);

    const mintBurnExt = getConfidentialMintBurnExtension(mintDecoded, input.mint);
    if (!state) {
        throw new Error(
            `Token account ${input.tokenAccount} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension).`,
        );
    }

    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);
    // `decrypted` is always populated because `keys` were passed to the fetch.
    const currentAvailableBalance = state.decrypted!.availableBalance;
    const auditorElgamalPubkey = input.auditorElgamalPubkey ?? getMintAuditorElgamalPubkey(mintDecoded);

    const proof = buildBurnProofData({
        currentAvailableBalanceCiphertext: new Uint8Array(state.ciphertexts.availableBalance),
        currentAvailableBalance,
        burnAmount: rawAmount,
        sourceElgamalKeypair: input.keys.elgamal,
        sourceAesKey: input.keys.aes,
        supplyElgamalPubkey: mintBurnExt.supplyElgamalPubkey,
        auditorElgamalPubkey,
    });

    const authority = toAuthoritySigner(input.authority);
    return assembleConfidentialMintBurnPlan({
        rpc: input.rpc,
        payer: input.payer,
        proof,
        buildTokenInstruction: records =>
            getConfidentialBurnInstruction({
                token: input.tokenAccount,
                mint: input.mint,
                equalityRecord: records.equalityRecord,
                ciphertextValidityRecord: records.ciphertextValidityRecord,
                rangeRecord: records.rangeRecord,
                authority,
                newDecryptableAvailableBalance: proof.newDecryptableBalance,
                burnAmountAuditorCiphertextLo: proof.auditorCiphertextLo,
                burnAmountAuditorCiphertextHi: proof.auditorCiphertextHi,
                // 0 = read each proof from its context-state account.
                equalityProofInstructionOffset: 0,
                ciphertextValidityProofInstructionOffset: 0,
                rangeProofInstructionOffset: 0,
            }),
    });
}

/**
 * Applies the mint's accumulated **pending burn** into its confidential supply,
 * finalizing prior confidential burns on the supply side. Signed by the mint
 * authority. No proof is required — returns a `singleInstructionPlan`.
 */
export function createApplyConfidentialPendingBurnInstructionPlan(input: {
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
}): InstructionPlan {
    return singleInstructionPlan(
        getApplyConfidentialPendingBurnInstruction({
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}
