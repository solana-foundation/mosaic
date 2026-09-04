import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    nonDivisibleSequentialInstructionPlan,
    singleInstructionPlan,
} from '@solana/kit';
import { fetchMint, fetchToken, getApplyConfidentialPendingBurnInstruction } from '@solana-program/token-2022';
import {
    getConfidentialBurnInstructionPlan,
    getPermissionedConfidentialBurnInstructionPlan,
} from '@solana-program/token-2022/confidential';
import { getPermissionedBurnAuthorityFromMint } from '../transaction-util.js';
import {
    getConfidentialTransferAccountElgamalPubkey,
    isConfidentialMintBurn,
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
} from './extensions.js';
import { assertConfidentialKeysMatchAccount, type ConfidentialKeys } from './keys.js';
import { createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan } from './supply.js';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util.js';

/**
 * Confidentially **burns** tokens from an account's available confidential
 * balance, decreasing the mint's encrypted total supply (recorded in the mint's
 * `pending_burn` accumulator until {@link createApplyConfidentialPendingBurnInstructionPlan}
 * is run). The burn amount stays encrypted on-chain.
 *
 * Wraps the official `getConfidentialBurnInstructionPlan` (standard variant) or,
 * for mints carrying the `PermissionedBurn` extension,
 * `getPermissionedConfidentialBurnInstructionPlan`. Both generate the three
 * required proofs (equality, grouped-ciphertext validity, U128 range) and wire
 * them through context-state accounts, so the plan spans multiple transactions
 * (proof setup → burn → cleanup).
 *
 * The burn is always authored by the **account owner** (`authority`, who holds
 * the account keys). On a `PermissionedBurn` mint the token-2022 program rejects
 * the standard variant, so the mint's configured **permissioned burn authority**
 * must additionally co-sign — pass it as `permissionedBurnAuthority` (a bare
 * address becomes a no-op signer for raw-tx flows). The mint's supply pubkey +
 * auditor are read from the mint by the upstream helper.
 *
 * Reads the mint (for decimals + `PermissionedBurn` detection) and the source
 * account, and adds the Mosaic value-adds: decimal `TokenAmount` handling and a
 * both-extensions-required + account-configured fail-fast.
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
    /**
     * The mint's permissioned burn authority. Required only when the mint
     * carries the `PermissionedBurn` extension with a set authority; ignored
     * otherwise. A bare address becomes a no-op signer.
     */
    permissionedBurnAuthority?: Address | TransactionSigner;
}): Promise<InstructionPlan> {
    const [mintDecoded, tokenDecoded] = await Promise.all([
        fetchMint(input.rpc, input.mint),
        fetchToken(input.rpc, input.tokenAccount),
    ]);

    // Fail fast with actionable messages rather than letting the upstream helper
    // throw deep in the stack. The mint must be confidential-mint/burn configured,
    // and (since the burned balance is confidential) also confidential-transfer
    // configured; the account must be confidential-transfer configured.
    if (!isConfidentialMintBurn(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} is not configured for confidential mint/burn ` +
                `(missing the ConfidentialMintBurn extension).`,
        );
    }
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} has ConfidentialMintBurn but not ConfidentialTransferMint; ` +
                `both are required for confidential burn.`,
        );
    }
    if (!isConfidentialTransferAccount(tokenDecoded)) {
        throw new Error(
            `Token account ${input.tokenAccount} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
                `createConfigureConfidentialAccountInstructionPlan.`,
        );
    }
    const registeredElgamalPubkey = getConfidentialTransferAccountElgamalPubkey(tokenDecoded);
    if (registeredElgamalPubkey !== null) {
        assertConfidentialKeysMatchAccount(input.keys, registeredElgamalPubkey, `token account ${input.tokenAccount}`);
    }

    const amount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    const commonArgs = {
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        mint: input.mint,
        mintAccount: mintDecoded.data,
        sourceTokenAccount: tokenDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount,
        sourceElgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
        auditorElgamalPubkey: input.auditorElgamalPubkey,
    };

    // On a PermissionedBurn mint the token-2022 program rejects the standard
    // burn variant (TokenError::InvalidInstruction) and requires the
    // permissioned variant, with the mint's burn authority as an extra signer.
    const permissionedBurnAuthority = getPermissionedBurnAuthorityFromMint(mintDecoded);
    if (permissionedBurnAuthority !== null) {
        if (input.permissionedBurnAuthority === undefined) {
            throw new Error(
                `Mint ${input.mint} has a permissioned burn authority (${permissionedBurnAuthority}); ` +
                    `confidential burn requires the permissioned variant. Pass permissionedBurnAuthority ` +
                    `(the burn-authority signer, or its address for a raw transaction).`,
            );
        }
        const providedAuthority = toAuthoritySigner(input.permissionedBurnAuthority);
        if (providedAuthority.address !== permissionedBurnAuthority) {
            throw new Error(
                `Mint ${input.mint}'s configured permissioned burn authority is ${permissionedBurnAuthority}, ` +
                    `but permissionedBurnAuthority ${providedAuthority.address} was provided. Pass the ` +
                    `authority currently configured on the mint (it may have been rotated).`,
            );
        }
        return getPermissionedConfidentialBurnInstructionPlan({
            ...commonArgs,
            permissionedBurnAuthority: providedAuthority,
        });
    }

    return getConfidentialBurnInstructionPlan(commonArgs);
}

/**
 * Applies the mint's accumulated **pending burn** into its confidential supply,
 * finalizing prior confidential burns on the supply side. Signed by the mint
 * authority. No proof is required.
 *
 * ⚠️ **On its own, this desynchronizes the mint's two supply representations, and
 * the next confidential mint will fail.** `ApplyPendingBurn` advances the ElGamal
 * `confidentialSupply` but cannot re-encrypt the AES `decryptableSupply`. A
 * confidential mint's equality proof is built from the AES form and checked
 * against the ElGamal one, so once they drift the proof is **rejected on-chain**.
 *
 * Pass {@link resyncSupply} to get both halves in one ordered plan — the
 * recommended form, since it makes the re-sync impossible to forget:
 *
 * ```ts
 * await step(
 *     createApplyConfidentialPendingBurnInstructionPlan({
 *         mint,
 *         authority: mintAuthority,
 *         resyncSupply: { supplyKeys, rawSupply: supplyAfterBurn },
 *     }),
 * );
 * ```
 *
 * Omitting it returns the bare `ApplyPendingBurn` as a `singleInstructionPlan`,
 * in which case the caller **must** itself follow up with
 * {@link createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan} before
 * the next confidential mint.
 */
export function createApplyConfidentialPendingBurnInstructionPlan(input: {
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /**
     * Re-assert the AES `decryptableSupply` in the same plan, immediately after
     * the `ApplyPendingBurn` — repairing the desync this instruction otherwise
     * leaves behind. Omit only if you sequence
     * {@link createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan}
     * yourself.
     */
    resyncSupply?: {
        /** The mint authority's supply keys (the AES key encrypts the decryptable supply). */
        supplyKeys: ConfidentialKeys;
        /**
         * The true total supply **after** this apply, in raw base units. Asserted,
         * not verified — see the warning on
         * {@link createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan}.
         */
        rawSupply: bigint;
    };
}): InstructionPlan {
    const applyPlan = singleInstructionPlan(
        getApplyConfidentialPendingBurnInstruction({
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
        }),
    );
    if (input.resyncSupply === undefined) {
        return applyPlan;
    }
    // Non-divisibly sequential: a planner must not split these across
    // transactions. `ApplyPendingBurn` never writes `decryptableSupply` (see
    // the warning above), so the ordering isn't about one overwriting the
    // other — it's that the resync's `rawSupply` must reflect the supply
    // *after* this apply. If the two land in separate transactions and the
    // second fails or expires, `decryptableSupply` is left stale and every
    // later confidential mint fails on-chain with an opaque proof error.
    return nonDivisibleSequentialInstructionPlan([
        applyPlan,
        createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
            mint: input.mint,
            authority: input.authority,
            supplyKeys: input.resyncSupply.supplyKeys,
            rawSupply: input.resyncSupply.rawSupply,
        }),
    ]);
}
