import type { Address } from '@solana/kit';
import { createKeyPairSignerFromPrivateKeyBytes, generateKeyPairSigner, getAddressDecoder } from '@solana/kit';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import { deriveConfidentialKeys as upstreamDeriveConfidentialKeys } from '@solana-program/token-2022/confidential';
import {
    assertConfidentialKeysMatchAccount,
    assertConfidentialKeysMatchSupply,
    deriveConfidentialKeys,
    getConfidentialMintBurnInit,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
} from '../keys.js';

// Uses the real @solana/zk-sdk WASM (verified to load under ts-jest ESM).
const MINT_A = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;

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

    // The derivation frees the intermediate `ConfidentialKeys` pair once it has
    // taken the two components out. Both must survive that: exercise each with a
    // real crypto round-trip, which would fault on a dangling WASM pointer.
    it('produces usable keys after the intermediate pair is freed', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer });

        const aesCiphertext = new Uint8Array(keys.aes.encrypt(7_777n).toBytes());
        expect(decryptAesBalance(keys.aes, aesCiphertext)).toBe(7_777n);

        const pubkey = keys.elgamal.pubkey();
        const elgamalCiphertext = new Uint8Array(pubkey.encryptU64(42n).toBytes());
        expect(decryptElGamalBalance(keys.elgamal, elgamalCiphertext)).toBe(42n);
        pubkey.free();

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

    // Upstream token-2022 ships its own `deriveConfidentialKeys` implementing the
    // same `solana-conf-bal/v1` wallet-only scheme. This SDK deliberately does NOT
    // delegate to it: upstream returns plain bytes, while every upstream
    // InstructionPlan helper requires live WASM `ElGamalKeypair`/`AeKey` objects,
    // and the local version additionally carries free() hygiene and richer signer
    // error diagnosis. This test buys the one thing delegating would have bought —
    // a guarantee the two derivations cannot silently diverge.
    it('derives byte-identical keys to the upstream token-2022 implementation', async () => {
        const signer = await generateKeyPairSigner();

        const ours = await deriveConfidentialKeys({ signer });
        const theirs = await upstreamDeriveConfidentialKeys({ signer });

        try {
            const ourSecret = ours.elgamal.secret();
            try {
                expect(new Uint8Array(ourSecret.toBytes())).toEqual(new Uint8Array(theirs.elgamalKeypair.secretKey));
            } finally {
                ourSecret.free?.();
            }

            const ourPubkey = ours.elgamal.pubkey();
            try {
                // Upstream exposes the ElGamal pubkey as a base58 Address; ours is raw
                // bytes, so compare through the same decoder the SDK uses internally.
                expect(getAddressDecoder().decode(new Uint8Array(ourPubkey.toBytes()))).toBe(
                    theirs.elgamalKeypair.elgamalPubkey,
                );
            } finally {
                ourPubkey.free?.();
            }

            expect(new Uint8Array(ours.aes.toBytes())).toEqual(new Uint8Array(theirs.aeKey));
        } finally {
            freeConfidentialKeys(ours);
        }
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

// A `ConfidentialMintBurn` mint's supply keys have no derivation of their own:
// they are `deriveConfidentialKeys` run against a dedicated supply-authority
// wallet. These tests pin the property that replaced the removed mint-seeded
// scheme — separation comes from using a different *wallet*, and cannot come from
// anywhere else.
describe('supply keys', () => {
    it("are indistinguishable from that wallet's account keys — one key pair per wallet", async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const asSupply = await deriveConfidentialKeys({ signer: supplyAuthority });
        const asAccount = await deriveConfidentialKeys({ signer: supplyAuthority });

        // The regression the removed `mosaic-conf-supply/v1` domain tag would hide:
        // there is no in-wallet separation to fall back on, so reusing a
        // balance-holding wallet as the supply authority hands out both at once.
        expect(asSupply.elgamal.pubkey().toBytes()).toEqual(asAccount.elgamal.pubkey().toBytes());
        expect(asSupply.aes.toBytes()).toEqual(asAccount.aes.toBytes());

        freeConfidentialKeys(asSupply);
        freeConfidentialKeys(asAccount);
    });

    it('are separated from a holder by using a different wallet', async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const holder = await generateKeyPairSigner();
        const supply = await deriveConfidentialKeys({ signer: supplyAuthority });
        const account = await deriveConfidentialKeys({ signer: holder });

        expect(supply.elgamal.pubkey().toBytes()).not.toEqual(account.elgamal.pubkey().toBytes());
        expect(supply.aes.toBytes()).not.toEqual(account.aes.toBytes());

        freeConfidentialKeys(supply);
        freeConfidentialKeys(account);
    });

    it('produce usable keys (AES + ElGamal round-trip)', async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer: supplyAuthority });

        expect(decryptAesBalance(keys.aes, new Uint8Array(keys.aes.encrypt(4_200n).toBytes()))).toBe(4_200n);
        const pubkey = keys.elgamal.pubkey();
        expect(decryptElGamalBalance(keys.elgamal, new Uint8Array(pubkey.encryptU64(11n).toBytes()))).toBe(11n);
        pubkey.free();

        freeConfidentialKeys(keys);
    });
});

describe('getConfidentialMintBurnInit', () => {
    it('emits the supply pubkey the supply guard later accepts', async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer: supplyAuthority });

        // The create -> operate round trip: whatever gets baked into the mint at
        // creation must be exactly what `assertConfidentialKeysMatchSupply` checks
        // for on every later confidential mint.
        const init = getConfidentialMintBurnInit(keys);
        expect(() => assertConfidentialKeysMatchSupply(keys, init.supplyElgamalPubkey, MINT_A)).not.toThrow();

        // Initial supply is zero, encrypted under the supply AES key.
        expect(decryptAesBalance(keys.aes, new Uint8Array(init.decryptableSupply))).toBe(0n);

        freeConfidentialKeys(keys);
    });
});

describe('assertConfidentialKeysMatchSupply', () => {
    it("does not throw when the derived pubkey matches the mint's registered supply key", async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer: supplyAuthority });
        const registered = getAddressDecoder().decode(keys.elgamal.pubkey().toBytes());

        expect(() => assertConfidentialKeysMatchSupply(keys, registered, MINT_A)).not.toThrow();

        freeConfidentialKeys(keys);
    });

    // The mistake the guard exists for: supply keys cannot be re-derived from the
    // mint or the mint authority, so presenting the wrong wallet is an ordinary
    // slip that would otherwise fail as an on-chain proof rejection.
    it('throws naming the mint when a different wallet signed the derivation', async () => {
        const supplyAuthority = await generateKeyPairSigner();
        const wrongWallet = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer: wrongWallet });
        const registeredKeys = await deriveConfidentialKeys({ signer: supplyAuthority });
        const registered = getAddressDecoder().decode(registeredKeys.elgamal.pubkey().toBytes());

        expect(() => assertConfidentialKeysMatchSupply(keys, registered, MINT_A)).toThrow(
            new RegExp(`does not match mint ${MINT_A}'s registered supply key`),
        );

        freeConfidentialKeys(keys);
        freeConfidentialKeys(registeredKeys);
    });
});

describe('assertConfidentialKeysMatchAccount', () => {
    it('does not throw when the derived pubkey matches the registered one', async () => {
        const signer = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer });
        const registered = getAddressDecoder().decode(keys.elgamal.pubkey().toBytes());

        expect(() => assertConfidentialKeysMatchAccount(keys, registered, 'token account X')).not.toThrow();

        freeConfidentialKeys(keys);
    });

    // The scenario the reviewer flagged: an account configured under an older
    // key-derivation scheme re-derives to different key bytes under the current
    // wallet-only one. Simulated here by comparing against a registered pubkey
    // from an unrelated derivation (a different signer).
    it('throws a targeted error when the derived pubkey does not match', async () => {
        const signer = await generateKeyPairSigner();
        const otherSigner = await generateKeyPairSigner();
        const keys = await deriveConfidentialKeys({ signer });
        const staleRegistered = await deriveConfidentialKeys({ signer: otherSigner });
        const registered = getAddressDecoder().decode(staleRegistered.elgamal.pubkey().toBytes());

        expect(() => assertConfidentialKeysMatchAccount(keys, registered, 'token account X')).toThrow(
            /does not match token account X's registered key/,
        );

        freeConfidentialKeys(keys);
        freeConfidentialKeys(staleRegistered);
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
