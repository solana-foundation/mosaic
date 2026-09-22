import {
    type Address,
    type MessagePartialSigner,
    type ReadonlyUint8Array,
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
 * its own wallet, not its own seed. That is why a `ConfidentialMintBurn` mint's
 * **supply** keys are simply {@link deriveConfidentialKeys} run against a
 * dedicated *supply authority* wallet (see {@link getConfidentialMintBurnInit}),
 * and why the same goes for an auditor key.
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

/** The two init values a `ConfidentialMintBurn` mint needs for its initial (zero) supply. */
export interface ConfidentialMintBurnInit {
    /** The supply ElGamal public key, as a kit `Address` (for `Token.withConfidentialMintBurn`). */
    supplyElgamalPubkey: Address;
    /** The initial (zero) supply encrypted under the supply AES key — 36-byte ciphertext. */
    decryptableSupply: ReadonlyUint8Array;
}

/**
 * Computes the `{ supplyElgamalPubkey, decryptableSupply }` pair that
 * {@link Token.withConfidentialMintBurn} needs, from the mint's supply keys. The
 * decryptable supply is the supply AES key's encryption of the initial supply
 * (`0`). Does not free `keys` (the caller owns them).
 *
 * `keys` are just {@link deriveConfidentialKeys} run against the **supply
 * authority** — a wallet dedicated to the encrypted supply, separate from any
 * wallet that holds a confidential balance:
 *
 * ```ts
 * const supplyKeys = await deriveConfidentialKeys({ signer: supplyAuthority });
 * new Token().withConfidentialMintBurn(getConfidentialMintBurnInit(supplyKeys));
 * ```
 *
 * ⚠️ Deriving these from a wallet that also holds confidential balances makes the
 * supply keys *identical* to that wallet's balance-decryption keys — derivation is
 * wallet-only, so a wallet has one key pair and no more. Handing the supply keys to
 * an auditor would then hand over that wallet's balances too. Use a dedicated
 * wallet; there is no in-wallet separation to fall back on.
 *
 * The supply keypair is never an on-chain signer — it is proof material — so the
 * supply authority need not be the mint authority that signs mint/burn
 * instructions.
 */
export function getConfidentialMintBurnInit(keys: ConfidentialKeys): ConfidentialMintBurnInit {
    const pubkey = keys.elgamal.pubkey();
    // Allocated inside the `try` so a throwing `encrypt` (e.g. `keys` already
    // freed, which surfaces as a wasm-bindgen null-pointer panic) still frees
    // `pubkey` instead of leaking it.
    let decryptable: AeCiphertext | undefined;
    try {
        decryptable = keys.aes.encrypt(0n);
        return {
            supplyElgamalPubkey: getAddressDecoder().decode(pubkey.toBytes()),
            // Copy out of WASM memory: `toBytes()` may return a view, and
            // `decryptable` is freed in the `finally` below.
            decryptableSupply: new Uint8Array(decryptable.toBytes()),
        };
    } finally {
        pubkey.free?.();
        decryptable?.free?.();
    }
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
 * Asserts that `keys` are the mint's **supply** keys — that their ElGamal public
 * key matches the `supplyElgamalPubkey` baked into its `ConfidentialMintBurn`
 * extension (see `getConfidentialMintBurnSupplyElgamalPubkey`).
 *
 * The supply-side counterpart to {@link assertConfidentialKeysMatchAccount}, and
 * the more likely mistake of the two: supply keys are the standard wallet-only
 * keys of a *dedicated supply-authority wallet*, so nothing about the mint or the
 * mint authority can re-derive them — presenting the wrong wallet is an ordinary
 * slip. Unguarded it surfaces as an on-chain proof rejection from deep inside the
 * upstream mint helper, which reads as a program bug rather than a wrong key.
 *
 * @param mint - The mint being operated on, for the error message.
 */
export function assertConfidentialKeysMatchSupply(
    keys: ConfidentialKeys,
    registeredSupplyElgamalPubkey: Address,
    mint: Address,
): void {
    const derived = derivedElgamalAddress(keys);
    if (derived !== registeredSupplyElgamalPubkey) {
        throw new Error(
            `The provided supply keys' ElGamal public key (${derived}) does not match mint ${mint}'s ` +
                `registered supply key (${registeredSupplyElgamalPubkey}). Supply keys are ` +
                `\`deriveConfidentialKeys({ signer: supplyAuthority })\` for the wallet the mint was created ` +
                `with — most likely a different wallet signed the derivation. Derivation is wallet-only, so ` +
                `neither the mint address nor the mint authority can re-derive them: the supply-authority ` +
                `wallet itself must sign.`,
        );
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
