import { getAddressDecoder } from '@solana/kit';
import {
    AeKey,
    BatchedGroupedCiphertext3HandlesValidityProofData,
    BatchedRangeProofU128Data,
    CiphertextCommitmentEqualityProofData,
    ElGamalKeypair,
} from '@solana/zk-sdk/node';
import { buildBurnProofData, buildMintProofData, elGamalCiphertextEncrypts } from '../mint-burn-proof';
import { decryptAesBalance } from '../keys';

/**
 * Real @solana/zk-sdk WASM acceptance test for the ported mint/burn proof-data
 * generation. This is the highest-risk new code (no upstream JS helper), so we
 * do more than assert shape: we cryptographically **verify** each generated
 * proof with the WASM verifier.
 *
 * `verify()` re-checks the proof against its embedded public inputs (pubkey,
 * ciphertext, commitment). The equality proof in particular only verifies if the
 * homomorphically-computed new supply / balance ciphertext genuinely encrypts
 * the committed value — so a bug in the Ristretto ciphertext math (add / combine
 * lo-hi / handle ordering) makes `verify()` throw. Passing all three proofs is a
 * strong offline signal that the construction matches the on-chain verifiers
 * (final validation remains the devnet e2e).
 */

const addressOf = (bytes: Uint8Array) => getAddressDecoder().decode(bytes);

function elgamalKeypair(fill: number): ElGamalKeypair {
    return ElGamalKeypair.fromSeed(new Uint8Array(32).fill(fill));
}

/** Encrypts `amount` under the keypair's pubkey; returns the 64-byte ciphertext. */
function encryptedBalance(keypair: ElGamalKeypair, amount: bigint): Uint8Array {
    const pubkey = keypair.pubkey();
    const ct = pubkey.encryptU64(amount);
    try {
        return new Uint8Array(ct.toBytes());
    } finally {
        ct.free?.();
        pubkey.free?.();
    }
}

function pubkeyAddress(keypair: ElGamalKeypair) {
    const pubkey = keypair.pubkey();
    try {
        return addressOf(pubkey.toBytes());
    } finally {
        pubkey.free?.();
    }
}

/** Reconstructs each proof from its bytes and verifies it; throws if any is invalid. */
function verifyAllProofs(proof: {
    equalityProofBytes: Uint8Array;
    ciphertextValidityProofBytes: Uint8Array;
    rangeProofBytes: Uint8Array;
}): void {
    const equality = CiphertextCommitmentEqualityProofData.fromBytes(proof.equalityProofBytes);
    const validity = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(proof.ciphertextValidityProofBytes);
    const range = BatchedRangeProofU128Data.fromBytes(proof.rangeProofBytes);
    try {
        equality.verify();
        validity.verify();
        range.verify();
    } finally {
        equality.free?.();
        validity.free?.();
        range.free?.();
    }
}

describe('buildMintProofData (real WASM)', () => {
    it('produces three cryptographically valid proofs and the new decryptable supply', () => {
        const supplyKeypair = elgamalKeypair(1);
        const supplyAes = AeKey.fromSeed(new Uint8Array(32).fill(2));
        const destinationKeypair = elgamalKeypair(3);

        const currentSupply = 100n;
        const mintAmount = 50n;

        const proof = buildMintProofData({
            currentSupplyCiphertext: encryptedBalance(supplyKeypair, currentSupply),
            currentSupply,
            mintAmount,
            supplyElgamalKeypair: supplyKeypair,
            supplyAesKey: supplyAes,
            destinationElgamalPubkey: pubkeyAddress(destinationKeypair),
        });

        expect(() => verifyAllProofs(proof)).not.toThrow();
        expect(proof.auditorCiphertextLo).toHaveLength(64);
        expect(proof.auditorCiphertextHi).toHaveLength(64);
        expect(proof.newDecryptableBalance).toHaveLength(36);
        expect(decryptAesBalance(supplyAes, proof.newDecryptableBalance)).toBe(currentSupply + mintAmount);

        supplyKeypair.free();
        supplyAes.free();
        destinationKeypair.free();
    });

    it('verifies with an explicit auditor pubkey and a large (lo+hi split) amount', () => {
        const supplyKeypair = elgamalKeypair(4);
        const supplyAes = AeKey.fromSeed(new Uint8Array(32).fill(5));
        const destinationKeypair = elgamalKeypair(6);
        const auditorKeypair = elgamalKeypair(7);

        const currentSupply = 1_000_000n;
        // Exceeds 2^16 so it exercises both the lo and hi halves.
        const mintAmount = 5_000_000n;

        const proof = buildMintProofData({
            currentSupplyCiphertext: encryptedBalance(supplyKeypair, currentSupply),
            currentSupply,
            mintAmount,
            supplyElgamalKeypair: supplyKeypair,
            supplyAesKey: supplyAes,
            destinationElgamalPubkey: pubkeyAddress(destinationKeypair),
            auditorElgamalPubkey: pubkeyAddress(auditorKeypair),
        });

        expect(() => verifyAllProofs(proof)).not.toThrow();
        expect(decryptAesBalance(supplyAes, proof.newDecryptableBalance)).toBe(currentSupply + mintAmount);

        supplyKeypair.free();
        supplyAes.free();
        destinationKeypair.free();
        auditorKeypair.free();
    });

    it('rejects a non-positive mint amount', () => {
        const supplyKeypair = elgamalKeypair(8);
        const supplyAes = AeKey.fromSeed(new Uint8Array(32).fill(9));
        const destinationKeypair = elgamalKeypair(10);
        expect(() =>
            buildMintProofData({
                currentSupplyCiphertext: encryptedBalance(supplyKeypair, 0n),
                currentSupply: 0n,
                mintAmount: 0n,
                supplyElgamalKeypair: supplyKeypair,
                supplyAesKey: supplyAes,
                destinationElgamalPubkey: pubkeyAddress(destinationKeypair),
            }),
        ).toThrow(/positive/);
        supplyKeypair.free();
        supplyAes.free();
        destinationKeypair.free();
    });

    it('rejects a mint amount above the 2^48 - 1 range-proof bound', () => {
        const supplyKeypair = elgamalKeypair(21);
        const supplyAes = AeKey.fromSeed(new Uint8Array(32).fill(22));
        const destinationKeypair = elgamalKeypair(23);
        expect(() =>
            buildMintProofData({
                currentSupplyCiphertext: encryptedBalance(supplyKeypair, 0n),
                currentSupply: 0n,
                mintAmount: 1n << 48n,
                supplyElgamalKeypair: supplyKeypair,
                supplyAesKey: supplyAes,
                destinationElgamalPubkey: pubkeyAddress(destinationKeypair),
            }),
        ).toThrow(/maximum confidential mint\/burn amount/);
        supplyKeypair.free();
        supplyAes.free();
        destinationKeypair.free();
    });
});

describe('elGamalCiphertextEncrypts (real WASM)', () => {
    it('returns true when the ciphertext encrypts the expected value', () => {
        const keypair = elgamalKeypair(30);
        expect(elGamalCiphertextEncrypts(keypair, encryptedBalance(keypair, 100n), 100n)).toBe(true);
        keypair.free();
    });

    it('returns true for a large (lo+hi) value without a slow discrete-log solve', () => {
        const keypair = elgamalKeypair(31);
        // Far beyond the ~2^32 discrete-log bound: only the diff (0) is decrypted.
        const large = (1n << 47n) + 12345n;
        expect(elGamalCiphertextEncrypts(keypair, encryptedBalance(keypair, large), large)).toBe(true);
        keypair.free();
    });

    it('returns false when the ciphertext encrypts more than expected (stale drift)', () => {
        const keypair = elgamalKeypair(32);
        // Mirrors a post-applyPendingBurn mint: on-chain ElGamal supply is lower
        // than the stale AES decryptable supply the caller passes in.
        expect(elGamalCiphertextEncrypts(keypair, encryptedBalance(keypair, 90n), 100n)).toBe(false);
        keypair.free();
    });

    it('returns false when the ciphertext encrypts less than expected', () => {
        const keypair = elgamalKeypair(33);
        expect(elGamalCiphertextEncrypts(keypair, encryptedBalance(keypair, 100n), 90n)).toBe(false);
        keypair.free();
    });

    it('returns false when a different key produced the ciphertext (wrong supply keys)', () => {
        const keypair = elgamalKeypair(34);
        const otherKeypair = elgamalKeypair(35);
        expect(elGamalCiphertextEncrypts(keypair, encryptedBalance(otherKeypair, 100n), 100n)).toBe(false);
        keypair.free();
        otherKeypair.free();
    });
});

describe('buildBurnProofData (real WASM)', () => {
    it('produces three cryptographically valid proofs and the new decryptable balance', () => {
        const sourceKeypair = elgamalKeypair(11);
        const sourceAes = AeKey.fromSeed(new Uint8Array(32).fill(12));
        const supplyKeypair = elgamalKeypair(13);

        const currentAvailableBalance = 200n;
        const burnAmount = 30n;

        const proof = buildBurnProofData({
            currentAvailableBalanceCiphertext: encryptedBalance(sourceKeypair, currentAvailableBalance),
            currentAvailableBalance,
            burnAmount,
            sourceElgamalKeypair: sourceKeypair,
            sourceAesKey: sourceAes,
            supplyElgamalPubkey: pubkeyAddress(supplyKeypair),
        });

        expect(() => verifyAllProofs(proof)).not.toThrow();
        expect(decryptAesBalance(sourceAes, proof.newDecryptableBalance)).toBe(currentAvailableBalance - burnAmount);

        sourceKeypair.free();
        sourceAes.free();
        supplyKeypair.free();
    });

    it('verifies with a lo+hi split amount and an auditor', () => {
        const sourceKeypair = elgamalKeypair(14);
        const sourceAes = AeKey.fromSeed(new Uint8Array(32).fill(15));
        const supplyKeypair = elgamalKeypair(16);
        const auditorKeypair = elgamalKeypair(17);

        const currentAvailableBalance = 10_000_000n;
        const burnAmount = 4_100_000n;

        const proof = buildBurnProofData({
            currentAvailableBalanceCiphertext: encryptedBalance(sourceKeypair, currentAvailableBalance),
            currentAvailableBalance,
            burnAmount,
            sourceElgamalKeypair: sourceKeypair,
            sourceAesKey: sourceAes,
            supplyElgamalPubkey: pubkeyAddress(supplyKeypair),
            auditorElgamalPubkey: pubkeyAddress(auditorKeypair),
        });

        expect(() => verifyAllProofs(proof)).not.toThrow();
        expect(decryptAesBalance(sourceAes, proof.newDecryptableBalance)).toBe(currentAvailableBalance - burnAmount);

        sourceKeypair.free();
        sourceAes.free();
        supplyKeypair.free();
        auditorKeypair.free();
    });

    it('rejects burning more than the available balance', () => {
        const sourceKeypair = elgamalKeypair(18);
        const sourceAes = AeKey.fromSeed(new Uint8Array(32).fill(19));
        const supplyKeypair = elgamalKeypair(20);
        expect(() =>
            buildBurnProofData({
                currentAvailableBalanceCiphertext: encryptedBalance(sourceKeypair, 10n),
                currentAvailableBalance: 10n,
                burnAmount: 25n,
                sourceElgamalKeypair: sourceKeypair,
                sourceAesKey: sourceAes,
                supplyElgamalPubkey: pubkeyAddress(supplyKeypair),
            }),
        ).toThrow(/exceeds the available/);
        sourceKeypair.free();
        sourceAes.free();
        supplyKeypair.free();
    });

    it('rejects a burn amount above the 2^48 - 1 range-proof bound', () => {
        const sourceKeypair = elgamalKeypair(24);
        const sourceAes = AeKey.fromSeed(new Uint8Array(32).fill(25));
        const supplyKeypair = elgamalKeypair(26);
        const overBound = 1n << 48n;
        expect(() =>
            buildBurnProofData({
                currentAvailableBalanceCiphertext: encryptedBalance(sourceKeypair, overBound),
                currentAvailableBalance: overBound,
                burnAmount: overBound,
                sourceElgamalKeypair: sourceKeypair,
                sourceAesKey: sourceAes,
                supplyElgamalPubkey: pubkeyAddress(supplyKeypair),
            }),
        ).toThrow(/maximum confidential mint\/burn amount/);
        sourceKeypair.free();
        sourceAes.free();
        supplyKeypair.free();
    });
});
