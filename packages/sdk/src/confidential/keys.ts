import {
    type Address,
    type MessagePartialSigner,
    type ReadonlyUint8Array,
    createSignableMessage,
    getAddressDecoder,
    getAddressEncoder,
    getTupleEncoder,
    getUtf8Encoder,
    signBytes,
} from '@solana/kit';
import {
    ElGamalKeypair,
    AeKey,
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
 * The public seed behind Token-2022's `(owner, mint)` key derivation: the two
 * addresses concatenated, exactly as upstream's (unexported) `ownerMintSeed`
 * builds it. Replicated here so a single signature can yield both keys — see
 * {@link deriveConfidentialKeysForOwnerMint}. Verified against upstream by
 * `keys.test.ts`, which asserts the keys match
 * `deriveElGamalKeypairForOwnerMint` / `deriveAeKeyForOwnerMint`.
 */
function ownerMintSeed(owner: Address, mint: Address): Uint8Array {
    return new Uint8Array(getTupleEncoder([getAddressEncoder(), getAddressEncoder()]).encode([owner, mint]));
}

/**
 * Did the user dismiss the wallet prompt, rather than the signer refusing the
 * message outright? A cancellation must not be reported as an incompatibility.
 */
function isSignerRejection(error: unknown): boolean {
    if ((error as { code?: unknown } | null)?.code === 4001) return true;
    return /reject|denied|declin|cancel/i.test(describeError(error));
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

/**
 * Derives an ElGamal keypair + AES key from a public seed with a **single**
 * signature over `ConfidentialKeys.signerMessage(seed)`. Shared by every
 * derivation in this module so they all cost one signature (one wallet prompt)
 * and all free the intermediate pair.
 *
 * A signer that refuses the message gets a diagnosis rather than the wallet's
 * raw text: the failure is intrinsic to the derivation scheme (the message bytes
 * are the key material and cannot be reshaped to suit a wallet), so the useful
 * information is *why* it cannot be fixed and what to do instead.
 */
async function deriveKeysFromSeed(signer: MessagePartialSigner, seed: Uint8Array): Promise<ConfidentialKeys> {
    const message = ZkConfidentialKeys.signerMessage(seed);

    let signatures: Awaited<ReturnType<MessagePartialSigner['signMessages']>>[number];
    try {
        [signatures] = await signer.signMessages([createSignableMessage(message)]);
    } catch (error) {
        if (isSignerRejection(error)) throw error;
        throw new Error(
            `The signer refused to sign the confidential-balance key-derivation message ` +
                `(${describeError(error)}). That message is \`solana-conf-bal/v1 || owner || mint\` — a ` +
                `domain-separated derivation seed, not a transaction — but some browser wallets classify ` +
                `binary sign-message payloads as transactions and block them. Its bytes determine the ` +
                `account keys, so they cannot be changed to satisfy a wallet without making balances ` +
                `undecryptable by every other tool. Use a wallet that signs arbitrary messages, or key the ` +
                `account through ConfidentialKeys.fromIkm/fromPrf instead (different keys — no CLI interop).`,
            { cause: error },
        );
    }

    const signature = signatures?.[signer.address];
    if (signature == null) {
        throw new Error(`Signer ${signer.address} did not return a signature`);
    }

    const derived = ZkConfidentialKeys.fromSignature(new Uint8Array(signature));
    try {
        // `elgamal()`/`ae()` hand back independently-owned objects, so the pair
        // itself is ours to release — otherwise every derivation leaks it.
        return { elgamal: derived.elgamal(), aes: derived.ae() };
    } finally {
        derived.free();
    }
}

/**
 * Derives the ElGamal keypair and AES key for a confidential token account with
 * Token-2022's `(owner, mint)`-bound derivation, as `@solana/zk-sdk` WASM objects
 * the operation helpers consume.
 *
 * Binding to `(owner, mint)` (rather than the token account address) keeps the
 * keys stable across closing and reopening the token account and prevents key
 * reuse across mints. Derivation is deterministic and requires no storage.
 *
 * Takes **one** signature. Both keys come from the same canonical message
 * (`ConfidentialKeys.signerMessage(ownerMintSeed(owner, mint))`), so calling
 * upstream's `deriveElGamalKeypairForOwnerMint` and `deriveAeKeyForOwnerMint`
 * would sign identical bytes twice — two wallet prompts for one derivation. This
 * derives the pair directly instead, exactly as {@link deriveConfidentialKeys}
 * does; the resulting keys are byte-identical to the two-call form.
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialKeysForOwnerMint(
    input: DeriveConfidentialKeysForOwnerMintInput,
): Promise<ConfidentialKeys> {
    const { signer, owner, mint } = input;
    return deriveKeysFromSeed(signer, ownerMintSeed(owner, mint));
}

export interface DeriveConfidentialSupplyKeysInput {
    /**
     * The **mint authority** — signs the canonical derivation message. The supply
     * keys are bound to `(mintAuthority, mint)`, so the same authority always
     * re-derives the same supply keys.
     */
    signer: MessagePartialSigner;
    /** The mint the supply keys are bound to. */
    mint: Address;
}

/**
 * Domain tag that separates supply-key derivation from account-key derivation.
 *
 * Account keys seed on `(owner, mint)` — two bare addresses. Prefixing this tag
 * makes the supply seed unreachable from any `(owner, mint)` pair, so the mint
 * authority's supply keys can never coincide with its own (or anyone's) account
 * keys for the same mint. Without it the two derivations are identical whenever
 * `owner === mintAuthority`, and disclosing account keys — to an auditor, to
 * support, in a backup — would also disclose the keys guarding the total supply.
 *
 * This is Mosaic's own seed, not an upstream convention: it is not interchangeable
 * with `spl-token`'s supply-key derivation, and changing the tag changes every
 * derived supply key.
 */
const SUPPLY_KEY_DOMAIN = 'mosaic-conf-supply/v1';

/**
 * Derives the **supply** ElGamal keypair + AES key for a `ConfidentialMintBurn`
 * mint. These are the mint authority's keys for the encrypted total supply,
 * distinct from any account's balance keys: the supply AES key encrypts the
 * decryptable supply, and the supply ElGamal keypair backs the mint/burn equality
 * proof.
 *
 * Bound to `(mintAuthority, mint)` under the {@link SUPPLY_KEY_DOMAIN} tag, so the
 * keys are stable, need no storage, and are cryptographically separated from the
 * `(owner, mint)` account derivation — a mint authority that also holds a
 * confidential account of the same mint gets two independent key sets.
 *
 * Takes one signature, like {@link deriveConfidentialKeysForOwnerMint}.
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialSupplyKeys(
    input: DeriveConfidentialSupplyKeysInput,
): Promise<ConfidentialKeys> {
    const seed = getTupleEncoder([getUtf8Encoder(), getAddressEncoder(), getAddressEncoder()]).encode([
        SUPPLY_KEY_DOMAIN,
        input.signer.address,
        input.mint,
    ]);
    return deriveKeysFromSeed(input.signer, new Uint8Array(seed));
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
