import { type Address, type InstructionPlan, type TransactionSigner, singleInstructionPlan } from '@solana/kit';
import { getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply } from '@solana-program/token-2022/confidential';
import type { ConfidentialKeys } from './keys';
import { toAuthoritySigner } from './util';

/**
 * Management for a `ConfidentialMintBurn` mint's supply-side state.
 *
 * The confidential supply is maintained on-chain both as an ElGamal ciphertext
 * (updated homomorphically by mint/burn) and as a cheap-to-decrypt AES
 * "decryptable supply". The two can drift — e.g. after burns whose pending-burn
 * has been applied — so the mint authority can re-assert the decryptable supply
 * to match the true supply it tracks with its supply AES key.
 *
 * Note: rotating the supply ElGamal keypair
 * (`RotateSupplyElgamalPubkey`) additionally requires a supply-re-encryption
 * equality proof and is intentionally not built here yet (follow-up).
 */

/**
 * Re-encrypts and updates the mint's **decryptable supply** to `rawSupply` under
 * the supply AES key. Signed by the mint authority. No proof required — returns
 * a `singleInstructionPlan`.
 *
 * ⚠️ **Required after every `ApplyPendingBurn`.** That instruction advances the
 * ElGamal `confidentialSupply` but cannot re-encrypt the AES form, and a
 * confidential mint's equality proof is built from the AES form and checked
 * against the ElGamal one — so until this runs, the next
 * {@link createConfidentialMintInstructionPlan} is **rejected on-chain**. See
 * `createApplyConfidentialPendingBurnInstructionPlan` in `./burn`.
 *
 * The value written here is asserted, not verified: the program re-encrypts
 * whatever it is given. Passing a value that does not match the supply the
 * ElGamal ciphertext actually encodes leaves the mint in the same broken state
 * this instruction exists to repair, so the caller must track the true supply
 * (mint amounts added, applied burn amounts subtracted).
 *
 * Delegates the AES re-encryption + instruction building to the official
 * `getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply`.
 */
export function createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan(input: {
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** The mint authority's supply keys (the AES key encrypts the decryptable supply). */
    supplyKeys: ConfidentialKeys;
    /**
     * The true current total supply, in **raw** base units — not decimal-scaled.
     * Unlike the `amount` parameters on mint/burn, this accepts no decimal string
     * form, so a UI amount must be scaled by the mint's decimals first.
     */
    rawSupply: bigint;
}): InstructionPlan {
    // Supply is a u64 on-chain. Upstream asserts this too, but checking here names
    // the offending parameter and its unit, and keeps the failure out of WASM.
    if (input.rawSupply < 0n || input.rawSupply > 0xffff_ffff_ffff_ffffn) {
        throw new Error(`rawSupply must be a u64 (0..2^64-1), got ${input.rawSupply}.`);
    }
    return singleInstructionPlan(
        getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply({
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
            supplyAesKey: input.supplyKeys.aes,
            supply: input.rawSupply,
        }),
    );
}
