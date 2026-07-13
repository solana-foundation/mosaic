import { ElGamalKeypair, GroupedElGamalCiphertext3Handles } from '@solana/zk-sdk/node';
import {
    addCiphertexts,
    combineLoHiCiphertexts,
    extractCiphertextFromGroupedBytes,
    subtractCiphertexts,
} from '../ciphertext-math';
import { decryptElGamalBalance } from '../keys';

// Real @solana/zk-sdk WASM. The homomorphic identities below are exactly what
// the mint/burn proof generation relies on, so exercise them against real
// ciphertexts and decrypt back (small amounts keep the ElGamal discrete-log
// decryption fast).

function keypairFromSeed(fill: number): ElGamalKeypair {
    return ElGamalKeypair.fromSeed(new Uint8Array(32).fill(fill));
}

/** Encrypts `amount` under `keypair`'s pubkey and returns the 64-byte ciphertext. */
function encrypt(keypair: ElGamalKeypair, amount: bigint): Uint8Array {
    const pubkey = keypair.pubkey();
    const ct = pubkey.encryptU64(amount);
    try {
        return new Uint8Array(ct.toBytes());
    } finally {
        ct.free?.();
        pubkey.free?.();
    }
}

describe('ciphertext-math homomorphic identities', () => {
    it('addCiphertexts encrypts the sum', () => {
        const kp = keypairFromSeed(1);
        const sum = addCiphertexts(encrypt(kp, 100n), encrypt(kp, 250n));
        expect(decryptElGamalBalance(kp, sum)).toBe(350n);
        kp.free();
    });

    it('subtractCiphertexts encrypts the difference', () => {
        const kp = keypairFromSeed(2);
        const diff = subtractCiphertexts(encrypt(kp, 900n), encrypt(kp, 300n));
        expect(decryptElGamalBalance(kp, diff)).toBe(600n);
        kp.free();
    });

    it('combineLoHiCiphertexts reconstitutes lo + hi·2^16', () => {
        const kp = keypairFromSeed(3);
        const lo = 5n;
        const hi = 2n;
        const combined = combineLoHiCiphertexts(encrypt(kp, lo), encrypt(kp, hi), 16n);
        expect(decryptElGamalBalance(kp, combined)).toBe(lo + (hi << 16n));
        kp.free();
    });

    it('extractCiphertextFromGroupedBytes recovers each handle for its own key', () => {
        const kpA = keypairFromSeed(4);
        const kpB = keypairFromSeed(5);
        const kpC = keypairFromSeed(6);
        const pkA = kpA.pubkey();
        const pkB = kpB.pubkey();
        const pkC = kpC.pubkey();
        const grouped = GroupedElGamalCiphertext3Handles.encrypt(pkA, pkB, pkC, 1234n);
        const bytes = grouped.toBytes();

        expect(decryptElGamalBalance(kpA, extractCiphertextFromGroupedBytes(bytes, 0))).toBe(1234n);
        expect(decryptElGamalBalance(kpB, extractCiphertextFromGroupedBytes(bytes, 1))).toBe(1234n);
        expect(decryptElGamalBalance(kpC, extractCiphertextFromGroupedBytes(bytes, 2))).toBe(1234n);

        grouped.free?.();
        pkA.free?.();
        pkB.free?.();
        pkC.free?.();
        kpA.free();
        kpB.free();
        kpC.free();
    });

    it('rejects malformed inputs', () => {
        expect(() => addCiphertexts(new Uint8Array(8), new Uint8Array(64))).toThrow(/64 ciphertext bytes/);
        expect(() => extractCiphertextFromGroupedBytes(new Uint8Array(64), 2)).toThrow(/handle 2/);
        expect(() => extractCiphertextFromGroupedBytes(new Uint8Array(128), -1)).toThrow(/non-negative/);
    });
});
