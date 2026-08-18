import type { Address } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import { deriveAeKeyForOwnerMint, deriveElGamalKeypairForOwnerMint } from '@solana-program/token-2022/confidential';
import {
    deriveConfidentialKeys,
    deriveConfidentialKeysForOwnerMint,
    deriveConfidentialSupplyKeys,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
} from '../keys';

// Uses the real @solana/zk-sdk WASM (verified to load under ts-jest ESM).
const TOKEN_ACCOUNT_A = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const TOKEN_ACCOUNT_B = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const MINT_A = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;

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

    // The derivation frees the intermediate `ConfidentialKeys` pair once it has
    // taken the two components out. Both must survive that: exercise each with a
    // real crypto round-trip, which would fault on a dangling WASM pointer.
    it('produces usable keys after the intermediate pair is freed', async () => {
        const keys = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A, signMessage });

        const aesCiphertext = new Uint8Array(keys.aes.encrypt(7_777n).toBytes());
        expect(decryptAesBalance(keys.aes, aesCiphertext)).toBe(7_777n);

        const pubkey = keys.elgamal.pubkey();
        const elgamalCiphertext = new Uint8Array(pubkey.encryptU64(42n).toBytes());
        expect(decryptElGamalBalance(keys.elgamal, elgamalCiphertext)).toBe(42n);
        pubkey.free();

        freeConfidentialKeys(keys);
    });

    // Taking only one component still frees the pair; the other must be unaffected.
    it('produces a usable key when only one component is derived', async () => {
        const aesKey = AeKey.fromSeed(new Uint8Array(32).fill(3));
        const keys = await deriveConfidentialKeys({ tokenAccount: TOKEN_ACCOUNT_A, signMessage, aesKey });

        const pubkey = keys.elgamal.pubkey();
        const ciphertext = new Uint8Array(pubkey.encryptU64(9n).toBytes());
        expect(decryptElGamalBalance(keys.elgamal, ciphertext)).toBe(9n);
        pubkey.free();

        freeConfidentialKeys(keys);
    });
});

describe('deriveConfidentialKeysForOwnerMint', () => {
    it('is deterministic: same signer + owner + mint yields the same keys', async () => {
        const signer = await generateKeyPairSigner();
        const a = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_A });
        const b = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_A });

        expect(a.elgamal.pubkey().toBytes()).toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('binds keys to the (owner, mint) pair: a different mint yields different keys', async () => {
        const signer = await generateKeyPairSigner();
        const a = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_A });
        const b = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_B });

        expect(a.elgamal.pubkey().toBytes()).not.toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).not.toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('produces usable keys (AES round-trip)', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_A });
        const ciphertext = new Uint8Array(keys.aes.encrypt(7_777n).toBytes());
        expect(decryptAesBalance(keys.aes, ciphertext)).toBe(7_777n);
        freeConfidentialKeys(keys);
    });

    // We derive both keys from ONE signature rather than calling upstream's two
    // helpers, which sign the same canonical message twice (two wallet prompts).
    // That requires replicating upstream's `ownerMintSeed`, so pin the result
    // against upstream: if their seed or message scheme ever changes, this fails
    // instead of silently producing keys that can't read existing balances.
    it('matches the upstream two-call derivation byte for byte', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint: MINT_A });

        const [upstreamElGamal, upstreamAesBytes] = await Promise.all([
            deriveElGamalKeypairForOwnerMint({ signer, owner: signer.address, mint: MINT_A }),
            deriveAeKeyForOwnerMint({ signer, owner: signer.address, mint: MINT_A }),
        ]);

        expect(new Uint8Array(keys.elgamal.secret().toBytes())).toEqual(new Uint8Array(upstreamElGamal.secretKey));
        expect(new Uint8Array(keys.aes.toBytes())).toEqual(new Uint8Array(upstreamAesBytes));

        freeConfidentialKeys(keys);
    });

    // One signature per derivation, not two — the regression this guards against
    // is a user-visible double wallet prompt on the recommended key path.
    it('requests exactly one signature', async () => {
        const signer = await generateKeyPairSigner();
        const signMessages = jest.fn(signer.signMessages.bind(signer));
        const spySigner = { ...signer, signMessages };

        const keys = await deriveConfidentialKeysForOwnerMint({
            signer: spySigner,
            owner: signer.address,
            mint: MINT_A,
        });

        expect(signMessages).toHaveBeenCalledTimes(1);
        freeConfidentialKeys(keys);
    });
});

describe('deriveConfidentialSupplyKeys', () => {
    it('is deterministic: same mint authority + mint yields the same supply keys', async () => {
        const signer = await generateKeyPairSigner();
        const a = await deriveConfidentialSupplyKeys({ signer, mint: MINT_A });
        const b = await deriveConfidentialSupplyKeys({ signer, mint: MINT_A });

        expect(a.elgamal.pubkey().toBytes()).toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    it('binds supply keys to the mint', async () => {
        const signer = await generateKeyPairSigner();
        const a = await deriveConfidentialSupplyKeys({ signer, mint: MINT_A });
        const b = await deriveConfidentialSupplyKeys({ signer, mint: MINT_B });

        expect(a.elgamal.pubkey().toBytes()).not.toEqual(b.elgamal.pubkey().toBytes());
        expect(a.aes.toBytes()).not.toEqual(b.aes.toBytes());

        freeConfidentialKeys(a);
        freeConfidentialKeys(b);
    });

    // The point of the domain tag: without it these two derivations are identical
    // whenever owner === mintAuthority, so handing out account keys (to an auditor,
    // to support, in a backup) would also hand out the total-supply keys.
    it('is domain-separated from the (owner, mint) account derivation', async () => {
        const signer = await generateKeyPairSigner();
        const supply = await deriveConfidentialSupplyKeys({ signer, mint: MINT_A });
        const account = await deriveConfidentialKeysForOwnerMint({
            signer,
            owner: signer.address,
            mint: MINT_A,
        });

        expect(supply.elgamal.pubkey().toBytes()).not.toEqual(account.elgamal.pubkey().toBytes());
        expect(supply.aes.toBytes()).not.toEqual(account.aes.toBytes());

        freeConfidentialKeys(supply);
        freeConfidentialKeys(account);
    });

    it('requests exactly one signature', async () => {
        const signer = await generateKeyPairSigner();
        const signMessages = jest.fn(signer.signMessages.bind(signer));
        const keys = await deriveConfidentialSupplyKeys({
            signer: { ...signer, signMessages },
            mint: MINT_A,
        });

        expect(signMessages).toHaveBeenCalledTimes(1);
        freeConfidentialKeys(keys);
    });

    it('produces usable keys (AES + ElGamal round-trip)', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialSupplyKeys({ signer, mint: MINT_A });

        expect(decryptAesBalance(keys.aes, new Uint8Array(keys.aes.encrypt(4_200n).toBytes()))).toBe(4_200n);
        const pubkey = keys.elgamal.pubkey();
        expect(decryptElGamalBalance(keys.elgamal, new Uint8Array(pubkey.encryptU64(11n).toBytes()))).toBe(11n);
        pubkey.free();

        freeConfidentialKeys(keys);
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
