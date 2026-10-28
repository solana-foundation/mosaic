import {
    type Address,
    type MessagePartialSigner,
    createSignableMessage,
    getAddressDecoder,
    signBytes,
} from '@solana/kit';
import {
    ElGamalKeypair,
    AeKey,
    ConfidentialKeys as ZkConfidentialKeys,
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
 * wallet can always re-derive them by signing again. Derivation is
 * **wallet-only**: there is no seed, so the same signer always derives the same
 * keys regardless of mint or token account. That matches the standard
 * every other client implementing `ConfidentialKeys.signerMessage`/`fromSignature`
 * uses, so keys derived here are byte-identical to keys derived anywhere else for
 * the same wallet.
 *
 * A consequence worth stating plainly, because it drives the API: a wallet has
 * exactly **one** confidential key pair. There is no domain separation to be had
 * within a wallet — any key derived from a wallet *is* that wallet's
 * balance-decryption key. So a role that must not share keys with a holder needs
 * its own wallet, not its own seed. That is why an auditor key, for instance,
 * should be {@link deriveConfidentialKeys} run against a dedicated wallet.
 *
 * NOTE: as of `@solana/zk-sdk` 0.5.x this is ONE signature over one canonical
 * message. It replaces the previous 0.4.x scheme of two independent signatures
 * over `b"ElGamalSecretKey" || seed` and `b"AeKey" || seed`, and the pre-HOO-1595
 * scheme of binding account keys to `(owner, mint)` or a token account address.
 * All of those produce DIFFERENT key bytes than the current wallet-only scheme,
 * so an account configured under an older scheme cannot be re-derived under this
 * one — its balances are still decryptable, but only with the retained key bytes
 * (see {@link assertConfidentialKeysMatchAccount}).
 *
 * `@solana/zk-sdk` (the WASM crypto dependency) is imported only here and in
 * `proof.ts`, so the rest of the SDK stays free of the WASM dependency and these
 * two modules can be mocked wholesale in unit tests.
 */

/**
 * Signs an arbitrary message with the account authority's Ed25519 key and
 * returns the 64-byte detached signature.
 *
 * This is **not** what {@link deriveConfidentialKeys} takes — that wants a kit
 * `MessagePartialSigner` (see {@link DeriveConfidentialKeysInput}). `SignMessage`
 * is the lower-level shape the `@solana/mosaic-sdk/confidential/wallet-standard`
 * subpath is built on: `createResilientSignMessage` produces one from a browser
 * wallet, {@link createKeyPairMessageSigner} produces one from a keypair, and
 * `createMessageSigner` adapts either into the `MessagePartialSigner` that
 * derivation actually consumes.
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
 * Derives an ElGamal keypair + AES key with a **single** signature over the
 * canonical `ConfidentialKeys.signerMessage` message. Derivation is wallet-only
 * — there is no seed — so every derivation in this module costs one signature
 * (one wallet prompt), fails the same way, and frees the intermediate pair.
 *
 * A signer that refuses the message gets a diagnosis rather than the wallet's
 * raw text: the failure is intrinsic to the derivation scheme (the message bytes
 * are the key material and cannot be reshaped to suit a wallet), so the useful
 * information is *why* it cannot be fixed and what to do instead.
 */
async function deriveKeysFromWalletSignature(signer: MessagePartialSigner): Promise<ConfidentialKeys> {
    const message = ZkConfidentialKeys.signerMessage(new Uint8Array(0));

    let signatures: Awaited<ReturnType<MessagePartialSigner['signMessages']>>[number];
    try {
        [signatures] = await signer.signMessages([createSignableMessage(message)]);
    } catch (error) {
        if (isSignerRejection(error)) throw error;
        throw new Error(
            `The signer refused to sign the confidential-balance key-derivation message ` +
                `(${describeError(error)}). That message is \`solana-conf-bal/v1\` ` +
                `— a domain-separated derivation constant, not a transaction — but some browser wallets classify ` +
                `binary sign-message payloads as transactions and block them. Its bytes determine the account ` +
                `keys, so they cannot be changed to satisfy a wallet without making balances undecryptable by ` +
                `every other tool. Use a wallet that signs arbitrary messages, or key the account through ` +
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
    return deriveKeysFromWalletSignature(input.signer);
}

/**
 * The ElGamal public key of a {@link ConfidentialKeys} pair, as a kit `Address`.
 * Frees the intermediate WASM pubkey object.
 */
function derivedElgamalAddress(keys: ConfidentialKeys): Address {
    const pubkey = keys.elgamal.pubkey();
    try {
        return getAddressDecoder().decode(pubkey.toBytes());
    } finally {
        pubkey.free?.();
    }
}

/**
 * Asserts that `keys`'s ElGamal public key matches `registeredElgamalPubkey` —
 * the key an account's confidential-transfer extension was actually configured
 * with (e.g. {@link getConfidentialTransferAccountElgamalPubkey}).
 *
 * Key derivation has changed schemes twice (0.4.x's two-signature scheme, then
 * the pre-HOO-1595 `(owner, mint)`/token-account-seeded scheme, now wallet-only);
 * an account configured under an older scheme re-derives to *different* key bytes
 * under the current one. Without this check, a caller who re-derives keys for
 * such an account gets no error — decryption just returns garbage or a WASM
 * "tampered ciphertext" error, indistinguishable from a corrupt account. Call
 * this right after fetching the account and before using `keys` to decrypt
 * or build a proof.
 *
 * @param context - What's being checked, for the error message (e.g. the token account address).
 */
export function assertConfidentialKeysMatchAccount(
    keys: ConfidentialKeys,
    registeredElgamalPubkey: Address,
    context: string,
): void {
    const derived = derivedElgamalAddress(keys);
    if (derived !== registeredElgamalPubkey) {
        throw new Error(
            `The provided confidential keys' ElGamal public key (${derived}) does not match ${context}'s ` +
                `registered key (${registeredElgamalPubkey}). This happens when an account was configured ` +
                `under a previous key-derivation scheme and its keys are re-derived under the current ` +
                `wallet-only one — they are not the same keys. Use the retained key bytes from when the ` +
                `account was configured, rather than re-deriving; or, if this account is unfamiliar, its data ` +
                `may be corrupt.`,
        );
    }
}

/**
 * Builds a {@link SignMessage} from a kit `KeyPairSigner`. The signer must expose
 * its underlying `CryptoKeyPair` (kit's generated keypair signers do).
 *
 * Note for CLI / Node callers: you do **not** need this to derive keys. A kit
 * `KeyPairSigner` is already a `MessagePartialSigner`, so pass it straight to
 * {@link deriveConfidentialKeys}. This helper exists for the `SignMessage`-shaped
 * seam in the wallet-standard subpath — for example to stand a keypair in for a
 * browser wallet as `createResilientSignMessage`'s fallback.
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
