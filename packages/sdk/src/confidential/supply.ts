import { type Address, type InstructionPlan, type TransactionSigner, singleInstructionPlan } from '@solana/kit';
import { getUpdateConfidentialMintBurnDecryptableSupplyInstruction } from '@solana-program/token-2022';
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
 * Re-encrypts and updates the mint's **decryptable supply** to `supply` under
 * the supply AES key. Signed by the mint authority. No proof required — returns
 * a `singleInstructionPlan`.
 */
export function createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan(input: {
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** The mint authority's supply keys (the AES key encrypts the decryptable supply). */
    supplyKeys: ConfidentialKeys;
    /** The true current supply to encode into the decryptable supply. */
    supply: bigint;
}): InstructionPlan {
    // Supply is a u64 on-chain; reject out-of-range values before handing them
    // to the WASM AES encrypt (which would otherwise fail opaquely or wrap).
    if (input.supply < 0n || input.supply > 0xffff_ffff_ffff_ffffn) {
        throw new Error(`supply must be a u64 (0..2^64-1), got ${input.supply}.`);
    }
    const ciphertext = input.supplyKeys.aes.encrypt(input.supply);
    let newDecryptableSupply: Uint8Array;
    try {
        newDecryptableSupply = new Uint8Array(ciphertext.toBytes());
    } finally {
        ciphertext.free?.();
    }
    return singleInstructionPlan(
        getUpdateConfidentialMintBurnDecryptableSupplyInstruction({
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
            newDecryptableSupply,
        }),
    );
}
