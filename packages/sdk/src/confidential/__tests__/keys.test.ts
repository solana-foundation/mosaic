import { createKeyPairSignerFromPrivateKeyBytes, generateKeyPairSigner } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import { deriveConfidentialKeys, freeConfidentialKeys, decryptAesBalance, decryptElGamalBalance } from '../keys.js';

// Uses the real @solana/zk-sdk WASM (verified to load under ts-jest ESM).

describe('deriveConfidentialKeys', () => {
    it('is deterministic: same signer yields the same keys', async () => {
        const signer = await generateKeyPairSigner();
        const a = await deriveConfidentialKeys({ signer });
        const b = await deriveConfidentialKeys({ signer });

        expect(a.elgamal.pubkey().toBytes()).toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('binds keys to the wallet: a different signer yields different keys', async () => {
        const signerA = await generateKeyPairSigner();
        const signerB = await generateKeyPairSigner();
        const a = await deriveConfidentialKeys({ signer: signerA });
        const b = await deriveConfidentialKeys({ signer: signerB });

        expect(a.elgamal.pubkey().toBytes()).not.toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).not.toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('produces usable keys (AES round-trip)', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer });
        const ciphertext = new Uint8Array(keys.aes.encrypt(7_777n).toBytes());
        expect(decryptAesBalance(keys.aes, ciphertext)).toBe(7_777n);
        freeConfidentialKeys(keys);
    });

    it('matches the cross-SDK standard vector', async () => {
        const signer = await createKeyPairSignerFromPrivateKeyBytes(
            new Uint8Array([
                0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
                0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00,
            ]),
        );
        const keys = await deriveConfidentialKeys({ signer });
        const secret = keys.elgamal.secret();
        try {
            expect(new Uint8Array(secret.toBytes())).toEqual(
                new Uint8Array([
                    0xbe, 0x5c, 0xce, 0x95, 0x1f, 0x42, 0xa2, 0xa8, 0x67, 0x7d, 0x1a, 0x56, 0xf0, 0x3a, 0xae, 0x7b,
                    0xff, 0x79, 0x5b, 0x38, 0xcf, 0x1c, 0x56, 0xc8, 0xcf, 0x3a, 0x4d, 0xae, 0x7d, 0x60, 0xe2, 0x05,
                ]),
            );
        } finally {
            secret.free?.();
        }
        expect(new Uint8Array(keys.aes.toBytes())).toEqual(
            new Uint8Array([
                0x64, 0x17, 0xee, 0xdb, 0xcb, 0xe9, 0xc6, 0x4a, 0x72, 0x39, 0x57, 0x19, 0xec, 0x98, 0xcf, 0x6b,
            ]),
        );
        freeConfidentialKeys(keys);
    });

    // One signature, not two — the regression this guards against is a
    // user-visible double wallet prompt for a single key derivation.
    it('requests exactly one signature', async () => {
        const signer = await generateKeyPairSigner();
        const signMessages = jest.fn(signer.signMessages.bind(signer));
        const keys = await deriveConfidentialKeys({ signer: { ...signer, signMessages } });

        expect(signMessages).toHaveBeenCalledTimes(1);
        freeConfidentialKeys(keys);
    });

    it('re-throws a genuine user rejection without diagnosing it as an incompatibility', async () => {
        const signer = await generateKeyPairSigner();
        const rejection = Object.assign(new Error('User rejected the request.'), { code: 4001 });
        const signMessages = jest.fn(async () => {
            throw rejection;
        });

        await expect(deriveConfidentialKeys({ signer: { ...signer, signMessages } })).rejects.toBe(rejection);
    });

    it('diagnoses a non-rejection signer refusal instead of surfacing the raw error', async () => {
        const signer = await generateKeyPairSigner();
        const signMessages = jest.fn(async () => {
            throw new Error('unsupported payload');
        });

        await expect(deriveConfidentialKeys({ signer: { ...signer, signMessages } })).rejects.toThrow(
            /solana-conf-bal\/v1/,
        );
    });
});

describe('balance decryption round-trips', () => {
    it('decryptAesBalance recovers the AES-encrypted amount', () => {
        const aes = AeKey.fromSeed(new Uint8Array(32).fill(7));
        const ciphertext = new Uint8Array(aes.encrypt(123_456n).toBytes());
        expect(decryptAesBalance(aes, ciphertext)).toBe(123_456n);
        aes.free();
    });

    it('decryptElGamalBalance recovers a (small) ElGamal-encrypted amount', () => {
        const elgamal = ElGamalKeypair.fromSeed(new Uint8Array(32).fill(8));
        const ciphertext = new Uint8Array(elgamal.pubkey().encryptU64(4_096n).toBytes());
        expect(decryptElGamalBalance(elgamal, ciphertext)).toBe(4_096n);
        elgamal.free();
    });

    it('decryptAesBalance throws on a malformed ciphertext', () => {
        const aes = AeKey.fromSeed(new Uint8Array(32).fill(9));
        expect(() => decryptAesBalance(aes, new Uint8Array(8))).toThrow(/AES ciphertext/);
        aes.free();
    });

    it('decryptElGamalBalance throws on a malformed ciphertext', () => {
        const elgamal = ElGamalKeypair.fromSeed(new Uint8Array(32).fill(10));
        expect(() => decryptElGamalBalance(elgamal, new Uint8Array(8))).toThrow(/ElGamal ciphertext/);
        elgamal.free();
    });
});
