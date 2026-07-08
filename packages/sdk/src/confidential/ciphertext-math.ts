import { type Address, getAddressDecoder, getAddressEncoder } from '@solana/kit';
import { ElGamalPubkey } from '@solana/mosaic-sdk/_zk';
import { ristretto255 } from '@noble/curves/ed25519';

/**
 * Homomorphic ElGamal ciphertext arithmetic over the Ristretto group.
 *
 * The confidential **mint** and **burn** proofs have no upstream
 * `InstructionPlan` helper, so — unlike transfer/withdraw — we build the proof
 * data ourselves (see `mint-burn-proof.ts`). Two of the steps need to combine
 * ElGamal ciphertexts homomorphically:
 *   - **mint**: `new_supply = current_supply + combine_lo_hi(mint_amount)`;
 *   - **burn**: `new_balance = current_balance − combine_lo_hi(burn_amount)`.
 *
 * `@solana/zk-sdk` exposes the ciphertext bytes but not point arithmetic, so
 * this module operates directly on the 64-byte ElGamal ciphertext encoding
 * (`commitment ‖ handle`, 32 bytes each) using `@noble/curves` Ristretto — the
 * exact same primitive token-2022's own confidential-transfer helper uses
 * internally. Pure byte functions, no WASM.
 */

const { Point: RistrettoPoint } = ristretto255;
type RistrettoPointT = ReturnType<typeof RistrettoPoint.fromHex>;

interface CiphertextPoints {
    commitment: RistrettoPointT;
    handle: RistrettoPointT;
}

function pointFromBytes(bytes: Uint8Array): RistrettoPointT {
    return RistrettoPoint.fromHex(bytes);
}

/** Splits a 64-byte ElGamal ciphertext into its commitment + handle points. */
function ciphertextToPoints(ciphertext: Uint8Array): CiphertextPoints {
    if (ciphertext.length !== 64) {
        throw new Error(`Expected 64 ciphertext bytes, got ${ciphertext.length}.`);
    }
    return {
        commitment: pointFromBytes(ciphertext.slice(0, 32)),
        handle: pointFromBytes(ciphertext.slice(32, 64)),
    };
}

/** Serializes a commitment + handle point pair back to a 64-byte ciphertext. */
function pointsToCiphertext(commitment: RistrettoPointT, handle: RistrettoPointT): Uint8Array {
    const ciphertext = new Uint8Array(64);
    ciphertext.set(commitment.toRawBytes(), 0);
    ciphertext.set(handle.toRawBytes(), 32);
    return ciphertext;
}

/**
 * Extracts the 64-byte ElGamal ciphertext for a single handle out of a grouped
 * (3-handle) ciphertext's bytes. The grouped encoding is
 * `commitment ‖ handle0 ‖ handle1 ‖ handle2` (32 bytes each); the extracted
 * ciphertext is `commitment ‖ handle[handleIndex]`.
 */
export function extractCiphertextFromGroupedBytes(groupedCiphertext: Uint8Array, handleIndex: number): Uint8Array {
    if (!Number.isInteger(handleIndex) || handleIndex < 0) {
        throw new Error(`handleIndex must be a non-negative integer, got ${handleIndex}.`);
    }
    const start = 32 + handleIndex * 32;
    const end = start + 32;
    if (groupedCiphertext.length < end) {
        throw new Error(`Grouped ciphertext does not contain handle ${handleIndex}.`);
    }
    const ciphertext = new Uint8Array(64);
    ciphertext.set(groupedCiphertext.slice(0, 32), 0);
    ciphertext.set(groupedCiphertext.slice(start, end), 32);
    return ciphertext;
}

/**
 * Combines the low and high halves of a lo/hi-split amount's ciphertexts into a
 * single ciphertext: `lo + hi · 2^bitLength`, applied to both the commitment and
 * the handle.
 */
export function combineLoHiCiphertexts(ciphertextLo: Uint8Array, ciphertextHi: Uint8Array, bitLength: bigint): Uint8Array {
    const scale = 1n << bitLength;
    const lo = ciphertextToPoints(ciphertextLo);
    const hi = ciphertextToPoints(ciphertextHi);
    return pointsToCiphertext(
        lo.commitment.add(hi.commitment.multiply(scale)),
        lo.handle.add(hi.handle.multiply(scale)),
    );
}

/** Homomorphic addition of two 64-byte ElGamal ciphertexts (mint: new supply). */
export function addCiphertexts(left: Uint8Array, right: Uint8Array): Uint8Array {
    const l = ciphertextToPoints(left);
    const r = ciphertextToPoints(right);
    return pointsToCiphertext(l.commitment.add(r.commitment), l.handle.add(r.handle));
}

/** Homomorphic subtraction of two 64-byte ElGamal ciphertexts (burn: remaining balance). */
export function subtractCiphertexts(left: Uint8Array, right: Uint8Array): Uint8Array {
    const l = ciphertextToPoints(left);
    const r = ciphertextToPoints(right);
    return pointsToCiphertext(l.commitment.subtract(r.commitment), l.handle.subtract(r.handle));
}

/**
 * Builds an `ElGamalPubkey` WASM object from a kit `Address` (a 32-byte ElGamal
 * pubkey stored as an address, as the mint/account extensions do). Caller owns
 * freeing the returned object.
 */
export function getElGamalPubkeyFromAddress(value: Address): ElGamalPubkey {
    return ElGamalPubkey.fromBytes(new Uint8Array(getAddressEncoder().encode(value)));
}

/**
 * The default (all-zero) auditor ElGamal pubkey, used when a mint has no auditor.
 * Mirrors the on-chain program, which still expects an auditor ciphertext. Caller
 * owns freeing the returned object.
 */
export function getDefaultAuditorElGamalPubkey(): ElGamalPubkey {
    return ElGamalPubkey.fromBytes(new Uint8Array(32));
}

/** Converts a 32-byte ElGamal pubkey byte array to a kit `Address`. */
export function elGamalPubkeyBytesToAddress(bytes: Uint8Array): Address {
    return getAddressDecoder().decode(bytes);
}
