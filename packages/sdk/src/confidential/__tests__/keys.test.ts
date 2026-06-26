import type { Address } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import {
    deriveConfidentialKeys,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
} from '../keys';

// Uses the real @solana/zk-sdk WASM (verified to load under ts-jest ESM).
const TOKEN_ACCOUNT_A = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const TOKEN_ACCOUNT_B = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;

describe('deriveConfidentialKeys', () => {
    let signMessage: SignMessage;

    beforeEach(async () => {
        const signer = await generateKeyPairSigner();
        signMessage = createKeyPairMessageSigner(signer);
    });

    it('is deterministic: same signer + token account yields the same keys', async () => {
        const a = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A, signMessage });
        const b = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A, signMessage });

        expect(a.elgamal.pubkey().toBytes()).toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('binds keys to the token account: a different account yields different keys', async () => {
        const a = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A, signMessage });
        const b = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_B, signMessage });

        expect(a.elgamal.pubkey().toBytes()).not.toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).not.toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('returns explicit overrides without signing', async () => {
        const elgamalKeypair = ElGamalKeypair.fromSeed(new Uint8Array(32).fill(1));
        const aesKey = AeKey.fromSeed(new Uint8Array(32).fill(2));
        const signSpy = jest.fn<ReturnType<SignMessage>, Parameters<SignMessage>>();

        const keys = await deriveConfidentialKeys({
            tokenAccount: TOKEN_ACCOUNT_A,
            signMessage: signSpy,
            elgamalKeypair,
            aesKey,
        });

        expect(keys.elgamal).toBe(elgamalKeypair);
        expect(keys.aes).toBe(aesKey);
        expect(signSpy).not.toHaveBeenCalled();
        freeConfidentialKeys(keys);
    });

    it('throws when neither signMessage nor both key overrides are provided', async () => {
        await expect(deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A })).rejects.toThrow(/signMessage/);
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
});
