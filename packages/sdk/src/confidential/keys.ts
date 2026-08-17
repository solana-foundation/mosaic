import {
    type Address,
    type MessagePartialSigner,
    type ReadonlyUint8Array,
    getAddressDecoder,
    getAddressEncoder,
    signBytes,
} from '@solana/kit';
import { deriveAeKeyForOwnerMint, deriveElGamalKeypairForOwnerMint } from '@solana-program/token-2022/confidential';
import {
    ElGamalKeypair,
    AeKey,
    ElGamalSecretKey,
    ConfidentialKeys as ZkConfidentialKeys,
    ElGamalCiphertext,
    AeCiphertext,
} from '@solana/mosaic-sdk/_zk';

/**
 * Confidential Transfer key derivation.
 *
 * A token account's confidential balances are encrypted under two keys owned by
 * the account authority:
 *   - an **ElGamal** keypair (homomorphic ciphertexts: pending/available balance), and
 *   - an **AES** key (the cheap-to-decrypt "decryptable available balance").
 *
 * Both are derived deterministically from an Ed25519 signature over a canonical,
 * token-account-bound message, so they never need to be stored — the authority
 * can always re-derive them by signing again. The public seed is the token
 * account address and the message to sign is produced by
 * `ConfidentialKeys.signerMessage(seed)`; a single signature yields BOTH keys
 * (`.elgamal()` / `.ae()`).
 *
 * NOTE: as of `@solana/zk-sdk` 0.5.x this is ONE signature over one canonical
 * message (`b"solana-conf-bal/v1" || seed`). It replaces the previous 0.4.x
 * scheme of two independent signatures over `b"ElGamalSecretKey" || seed` and
 * `b"AeKey" || seed`. The keys the two schemes produce are DIFFERENT, so an
 * account configured under the old scheme cannot be re-derived under this one —
 * its balances are still decryptable, but only with the retained key bytes.
 * token-2022 0.15.0 made the same switch in `deriveElGamalKeypairForOwnerMint` /
 * `deriveAeKeyForOwnerMint`, so this is an upstream-wide change, not a local one.
 *
 * `@solana/zk-sdk` (the WASM crypto dependency) is imported only here and in
 * `proof.ts`, so the rest of the SDK stays free of the WASM dependency and these
 * two modules can be mocked wholesale in unit tests.
 */

/**
 * Signs an arbitrary message with the account authority's Ed25519 key and
 * returns the 64-byte detached signature.
 *
 * - CLI / Node: build one from a kit `KeyPairSigner` via {@link createKeyPairMessageSigner}.
 * - Browser: wrap the wallet adapter's `signMessage` (it must sign the raw bytes).
 */
export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * The pair of WASM crypto objects that decrypt/encrypt a token account's
 * confidential balances.
 *
 * ⚠️ Both `elgamal` and `aes` own WebAssembly memory. Call `.free()` on each
 * (or use {@link freeConfidentialKeys}) once you are done with them — especially
 * in long-lived processes (CLI, server) — to avoid leaking.
 */
export interface ConfidentialKeys {
    elgamal: ElGamalKeypair;
    aes: AeKey;
}

export interface DeriveConfidentialKeysInput {
    /**
     * The token account the keys are bound to. Its address is the public seed,
     * so keys derived for one account cannot decrypt another's balances.
     */
    tokenAccount: Address;
    /**
     * Signs the canonical derivation messages. Required unless both
     * `elgamalKeypair` and `aesKey` are supplied.
     */
    signMessage?: SignMessage;
    /** Explicit ElGamal keypair override (skips derivation for this key). */
    elgamalKeypair?: ElGamalKeypair;
    /** Explicit AES key override (skips derivation for this key). */
    aesKey?: AeKey;
}

/**
 * Derives (or accepts overrides for) the ElGamal keypair and AES key for a
 * confidential token account, seeded by the **token account address**.
 *
 * ⚠️ **Prefer {@link deriveConfidentialKeysForOwnerMint} for ordinary wallets.**
 * That one binds to `(owner, mint)`, so the keys survive closing and reopening
 * the account; these are bound to the account address, so a reopened account
 * derives *different* keys and can no longer read its old balances.
 *
 * Reach for this function when you need control over the seed rather than the
 * `(owner, mint)` convention — most notably PDA / passkey wallets, which key off
 * `ConfidentialKeys.pdaWalletPublicSeed(...)` instead of a plain address. It is
 * the thin wrapper over the canonical upstream scheme; the `(owner, mint)`
 * helper is the opinionated default layered on top.
 *
 * Derivation is deterministic: the same authority + token account always yields
 * the same keys. Pass `elgamalKeypair`/`aesKey` to bypass derivation (e.g. tests,
 * or callers that manage their own key material).
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialKeys(input: DeriveConfidentialKeysInput): Promise<ConfidentialKeys> {
    const { tokenAccount, signMessage, elgamalKeypair, aesKey } = input;

    if (elgamalKeypair && aesKey) {
        return { elgamal: elgamalKeypair, aes: aesKey };
    }
    if (!signMessage) {
        throw new Error(
            'deriveConfidentialKeys requires `signMessage`, or both `elgamalKeypair` and `aesKey` to be provided.',
        );
    }

    // The token account address is the public seed (32 bytes).
    const seed = new Uint8Array(getAddressEncoder().encode(tokenAccount));

    // One signature over the single canonical message yields both components.
    // Only reached when at least one key still has to be derived (see the
    // both-overrides early return above).
    const derived = ZkConfidentialKeys.fromSignature(await signMessage(ZkConfidentialKeys.signerMessage(seed)));
    try {
        return {
            elgamal: elgamalKeypair ?? derived.elgamal(),
            aes: aesKey ?? derived.ae(),
        };
    } finally {
        // `elgamal()`/`ae()` hand back independently-owned objects, so the pair
        // itself is ours to release — otherwise every derivation leaks it.
        derived.free();
    }
}

export interface DeriveConfidentialKeysForOwnerMintInput {
    /**
     * Signs the canonical derivation messages. A kit `KeyPairSigner` satisfies
     * `MessagePartialSigner`; in the browser, wrap the wallet adapter.
     */
    signer: MessagePartialSigner;
    /** The token account owner the keys are bound to. */
    owner: Address;
    /** The mint the keys are bound to. */
    mint: Address;
}

/**
 * Derives the ElGamal keypair and AES key for a confidential token account using
 * the official Token-2022 `(owner, mint)`-bound derivation
 * (`deriveElGamalKeypairForOwnerMint` / `deriveAeKeyForOwnerMint`), then
 * reconstructs the `@solana/zk-sdk` WASM objects the operation helpers consume.
 *
 * Binding to `(owner, mint)` (rather than the token account address) keeps the
 * keys stable across closing and reopening the token account and prevents key
 * reuse across mints. Derivation is deterministic and requires no storage.
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialKeysForOwnerMint(
    input: DeriveConfidentialKeysForOwnerMintInput,
): Promise<ConfidentialKeys> {
    const { signer, owner, mint } = input;

    const [derivedElGamal, aesBytes] = await Promise.all([
        deriveElGamalKeypairForOwnerMint({ signer, owner, mint }),
        deriveAeKeyForOwnerMint({ signer, owner, mint }),
    ]);

    // `fromSecretKey` consumes the secret-key WASM object (by value), so it must
    // not be freed afterwards.
    const secret = ElGamalSecretKey.fromBytes(new Uint8Array(derivedElGamal.secretKey));
    const elgamal = ElGamalKeypair.fromSecretKey(secret);
    const aes = AeKey.fromBytes(new Uint8Array(aesBytes));

    return { elgamal, aes };
}

export interface DeriveConfidentialSupplyKeysInput {
    /**
     * The **mint authority** — signs the canonical derivation messages. The
     * supply keys are bound to `(mintAuthority, mint)`, so the same authority
     * always re-derives the same supply keys.
     */
    signer: MessagePartialSigner;
    /** The mint the supply keys are bound to. */
    mint: Address;
}

/**
 * Derives the **supply** ElGamal keypair + AES key for a `ConfidentialMintBurn`
 * mint. These are the mint authority's keys for the encrypted total supply
 * (conceptually separate from any account's balance keys): the supply AES key
 * encrypts the decryptable supply, and the supply ElGamal keypair backs the
 * mint/burn equality proof.
 *
 * Bound to `(mintAuthority, mint)` via the same `(owner, mint)` derivation as
 * {@link deriveConfidentialKeysForOwnerMint} (with `owner = signer.address`), so
 * the keys are stable and need no storage. Because the derivation is identical,
 * the supply keys are not cryptographically domain-separated from account keys —
 * if the mint authority also derives account keys for itself under the same
 * mint, the material coincides.
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialSupplyKeys(
    input: DeriveConfidentialSupplyKeysInput,
): Promise<ConfidentialKeys> {
    return deriveConfidentialKeysForOwnerMint({ signer: input.signer, owner: input.signer.address, mint: input.mint });
}

/** The two init values a `ConfidentialMintBurn` mint needs for its initial (zero) supply. */
export interface ConfidentialMintBurnInit {
    /** The supply ElGamal public key, as a kit `Address` (for `Token.withConfidentialMintBurn`). */
    supplyElgamalPubkey: Address;
    /** The initial (zero) supply encrypted under the supply AES key — 36-byte ciphertext. */
    decryptableSupply: ReadonlyUint8Array;
}

/**
 * Computes the `{ supplyElgamalPubkey, decryptableSupply }` pair that
 * {@link Token.withConfidentialMintBurn} needs, from derived supply keys. The
 * decryptable supply is the supply AES key's encryption of the initial supply
 * (`0`). Does not free `keys` (the caller owns them).
 */
export function getConfidentialMintBurnInit(keys: ConfidentialKeys): ConfidentialMintBurnInit {
    const pubkey = keys.elgamal.pubkey();
    const decryptable = keys.aes.encrypt(0n);
    try {
        return {
            supplyElgamalPubkey: getAddressDecoder().decode(pubkey.toBytes()),
            // Copy out of WASM memory: `toBytes()` may return a view, and
            // `decryptable` is freed in the `finally` below.
            decryptableSupply: new Uint8Array(decryptable.toBytes()),
        };
    } finally {
        pubkey.free?.();
        decryptable.free?.();
    }
}

/**
 * Builds a {@link SignMessage} from a kit `KeyPairSigner` (CLI / Node). The
 * signer must expose its underlying `CryptoKeyPair` (kit's generated keypair
 * signers do).
 */
export function createKeyPairMessageSigner(signer: { keyPair: CryptoKeyPair }): SignMessage {
    return message => signBytes(signer.keyPair.privateKey, message);
}

/**
 * Frees the WebAssembly memory held by a {@link ConfidentialKeys} pair. Safe to
 * call once; the objects must not be used afterwards.
 */
export function freeConfidentialKeys(keys: ConfidentialKeys): void {
    keys.elgamal.free();
    keys.aes.free();
}

/**
 * Decrypts an AES "decryptable balance" (the 36-byte
 * `decryptableAvailableBalance` ciphertext) to its u64 amount. Fast and exact —
 * this is the cheap path the account authority uses to read its own available
 * balance.
 */
export function decryptAesBalance(aes: AeKey, ciphertext: Uint8Array): bigint {
    const ct = AeCiphertext.fromBytes(ciphertext);
    if (!ct) {
        throw new Error('Failed to decode AES ciphertext (expected 36 bytes).');
    }
    try {
        return aes.decrypt(ct);
    } finally {
        ct.free?.();
    }
}

/**
 * Decrypts a 64-byte ElGamal balance ciphertext (pending/available balance) to
 * its amount by solving the discrete log. Exact, but cost grows with the
 * plaintext: 16-bit values are instant, 32-bit values can be slow. Prefer
 * {@link decryptAesBalance} for the available balance; use this for pending
 * balances (which have no AES form).
 */
export function decryptElGamalBalance(elgamal: ElGamalKeypair, ciphertext: Uint8Array): bigint {
    const ct = ElGamalCiphertext.fromBytes(ciphertext);
    if (!ct) {
        throw new Error('Failed to decode ElGamal ciphertext (expected 64 bytes).');
    }
    const secret = elgamal.secret();
    try {
        return secret.decrypt(ct);
    } finally {
        ct.free?.();
        secret.free?.();
    }
}
