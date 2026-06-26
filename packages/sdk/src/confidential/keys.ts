import { type Address, getAddressEncoder, signBytes } from '@solana/kit';
import { ElGamalKeypair, AeKey, ElGamalSecretKey, ElGamalCiphertext, AeCiphertext } from '@solana/zk-sdk/node';

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
 * can always re-derive them by signing again. This mirrors the Agave
 * `ElGamalKeypair::new_from_signer` / `AeKey::new_from_signer` scheme: the public
 * seed is the token account address, and the message to sign is produced by
 * `ElGamalSecretKey.signerMessage(seed)` / `AeKey.signerMessage(seed)`.
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
 * confidential token account.
 *
 * Derivation is deterministic: the same authority + token account always yields
 * the same keys. Pass `elgamalKeypair`/`aesKey` to bypass derivation (e.g. tests,
 * or callers that manage their own key material).
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

    const elgamal = elgamalKeypair ?? ElGamalKeypair.fromSignature(await signMessage(ElGamalSecretKey.signerMessage(seed)));
    const aes = aesKey ?? AeKey.fromSignature(await signMessage(AeKey.signerMessage(seed)));

    return { elgamal, aes };
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
