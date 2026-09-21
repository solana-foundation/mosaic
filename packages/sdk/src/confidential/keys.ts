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
    ConfidentialKeys as ZkConfidentialKeys,
    ElGamalKeypair,
    AeKey,
    ElGamalCiphertext,
    AeCiphertext,
} from '@solana/mosaic-sdk/_zk';
import { isSignerRejection, describeError } from './signer-errors.js';

/**
 * Confidential Transfer key derivation.
 *
 * A confidential-balance holder's balances are encrypted under two keys owned
 * by the wallet:
 *   - an **ElGamal** keypair (homomorphic ciphertexts: pending/available balance), and
 *   - an **AES** key (the cheap-to-decrypt "decryptable available balance").
 *
 * Both are derived deterministically from a single Ed25519 signature over the
 * canonical `solana-conf-bal/v1` message, so they never need to be stored — the
 * wallet can always re-derive them by signing again. This is **wallet-only**:
 * there is no seed, so the same signer always derives the same keys regardless
 * of mint or token account. That matches the standard every other client
 * implementing `ConfidentialKeys.signerMessage`/`fromSignature` uses, so keys
 * derived here are byte-identical to keys derived anywhere else for the same
 * wallet.
 *
 * The one exception is {@link deriveConfidentialSupplyKeys}: a `ConfidentialMintBurn`
 * mint's *supply* keys are Mosaic's own construction, not a cross-client standard,
 * and are seeded so they can never coincide with the mint authority's wallet-only
 * account keys.
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
     * Signs the canonical derivation message. A kit `KeyPairSigner` satisfies
     * `MessagePartialSigner`; in the browser, wrap the wallet adapter — see
     * `@solana/mosaic-sdk/confidential/wallet-standard`.
     */
    signer: MessagePartialSigner;
}

/**
 * Derives the ElGamal keypair and AES key for a confidential-balance holder,
 * bound to the **wallet alone** — no token-account, owner, or mint seed. One
 * signature yields both keys (`ConfidentialKeys.signerMessage(new Uint8Array(0))`,
 * then `fromSignature`).
 *
 * Because there is no seed, the same signer always derives the same keys for
 * every mint and every token account it holds — this is the `solana-conf-bal/v1`
 * standard, so keys derived here are byte-identical to keys derived by any other
 * standard client for the same wallet.
 *
 * ⚠️ The returned keys own WASM memory — free them with {@link freeConfidentialKeys}.
 */
export async function deriveConfidentialKeys(input: DeriveConfidentialKeysInput): Promise<ConfidentialKeys> {
    // The empty seed IS the standard: `signerMessage(b"")` is the canonical
    // `solana-conf-bal/v1` message every conforming client signs.
    return deriveKeysFromSeed(input.signer, new Uint8Array(0));
}

/**
 * Derives an ElGamal keypair + AES key from one signature over
 * `ConfidentialKeys.signerMessage(seed)` (i.e. `b"solana-conf-bal/v1" || seed`).
 * Shared by every derivation in this module so they all cost exactly one
 * signature — one wallet prompt — and all free the intermediate pair.
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
                `(${describeError(error)}). That message is \`solana-conf-bal/v1\` — a domain-separated ` +
                `derivation seed, not a transaction — but some browser wallets classify binary sign-message ` +
                `payloads as transactions and block them. Its bytes determine the derived keys, so they ` +
                `cannot be changed to satisfy a wallet without making balances undecryptable by every other ` +
                `tool. Use a wallet that signs arbitrary messages, or key the account through ` +
                `ConfidentialKeys.fromIkm/fromPrf instead (different keys — no cross-tool interop).`,
            { cause: error },
        );
    }

    const signature = signatures?.[signer.address];
    if (signature == null) {
        throw new Error(`Signer ${signer.address} did not return a signature`);
    }

    const derived = ZkConfidentialKeys.fromSignature(new Uint8Array(signature));
    let elgamal: ElGamalKeypair | undefined;
    try {
        // `elgamal()`/`ae()` hand back independently-owned objects, so the pair
        // itself is ours to release — otherwise every derivation leaks it.
        elgamal = derived.elgamal();
        const aes = derived.ae();
        return { elgamal, aes };
    } catch (error) {
        elgamal?.free();
        throw error;
    } finally {
        derived.free();
    }
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
 * Account keys are wallet-only — the empty seed. Prefixing this tag makes the
 * supply seed unreachable from that derivation, so a mint authority's supply keys
 * can never coincide with its own confidential *balance* keys. Without it the two
 * would be the same keys for the same signer, and disclosing account keys — to an
 * auditor, to support, in a backup — would also disclose the keys guarding the
 * total supply.
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
 * wallet-only account derivation — a mint authority that also holds a confidential
 * account of the same mint gets two independent key sets.
 *
 * Unlike {@link deriveConfidentialKeys} this is **not** a cross-client standard:
 * no other tool derives these bytes. It is also not reachable through
 * `@solana/mosaic-sdk/confidential/wallet-standard`, whose signer only signs the
 * canonical empty-seed message — derive supply keys from a signer that signs
 * arbitrary bytes (CLI / filesystem keypair).
 *
 * Takes one signature, like {@link deriveConfidentialKeys}.
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
