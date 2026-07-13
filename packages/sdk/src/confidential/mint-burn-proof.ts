import type { Address } from '@solana/kit';
import {
    type AeKey,
    type ElGamalKeypair,
    BatchedGroupedCiphertext3HandlesValidityProofData,
    BatchedRangeProofU128Data,
    CiphertextCommitmentEqualityProofData,
    ElGamalCiphertext,
    GroupedElGamalCiphertext3Handles,
    PedersenCommitment,
    PedersenOpening,
} from '@solana/mosaic-sdk/_zk';
import {
    addCiphertexts,
    combineLoHiCiphertexts,
    extractCiphertextFromGroupedBytes,
    getDefaultAuditorElGamalPubkey,
    getElGamalPubkeyFromAddress,
    subtractCiphertexts,
} from './ciphertext-math';

/**
 * Confidential **mint** / **burn** proof-data generation.
 *
 * Unlike transfer/withdraw/configure, token-2022 ships **no** upstream
 * `InstructionPlan` helper for mint & burn — only the raw instruction builders —
 * so we generate the three proof-data objects ourselves. This is a direct port
 * of the reference `spl-token-confidential-transfer-proof-generation`
 * `mint_split_proof_data` / `burn_split_proof_data` (`mint.rs` / `burn.rs`) onto
 * the `@solana/zk-sdk` WASM proof-data classes — the exact same classes
 * token-2022's own confidential-transfer helper uses internally.
 *
 * Both operations produce three proofs (verified in context-state accounts by
 * `buildMintBurnProofIxs`): a ciphertext-commitment **equality** proof, a
 * batched grouped-ciphertext-3-handles **validity** proof, and a **U128** range
 * proof. The amount is split into a 16-bit low half and a 32-bit high half and
 * grouped-encrypted under three ElGamal keys. The handle order and which handle
 * feeds the running supply/balance are the load-bearing details:
 *   - **mint**: handles `[destination, supply, auditor]`; the *supply* handle
 *     (index 1) is **added** to the mint's current supply ciphertext;
 *   - **burn**: handles `[source, supply, auditor]`; the *source* handle
 *     (index 0) is **subtracted** from the account's available balance.
 * The auditor ciphertext the instruction carries is always handle index 2.
 *
 * As this is the highest-risk new code and can only be validated against the
 * on-chain verifiers (devnet e2e), the constants and ordering below mirror the
 * Rust reference verbatim.
 *
 * Along with `keys.ts`, `proof.ts`, and `account-state.ts`, this module imports
 * the WASM crypto; it frees every WASM object it allocates before returning
 * pure bytes.
 */

// Bit lengths — identical to the Rust reference (mint.rs / burn.rs).
const AMOUNT_LO_BIT_LENGTH = 16;
const AMOUNT_HI_BIT_LENGTH = 32;
const SUPPLY_OR_BALANCE_BIT_LENGTH = 64;
const RANGE_PROOF_PADDING_BIT_LENGTH = 16;
const LO_BIT_LENGTH_BIGINT = BigInt(AMOUNT_LO_BIT_LENGTH);

const U64_MAX = (1n << 64n) - 1n;

// The mint/burn amount is range-proven as a 16-bit low half + 32-bit high half,
// so it must fit in 48 bits (matching the Rust reference). A larger amount would
// otherwise silently produce a range proof the on-chain verifier rejects.
const MAX_MINT_BURN_AMOUNT = (1n << BigInt(AMOUNT_LO_BIT_LENGTH + AMOUNT_HI_BIT_LENGTH)) - 1n;

/** Serialized proof data + ciphertexts for a confidential mint or burn instruction. */
export interface MintBurnProofData {
    /** `CiphertextCommitmentEquality` proof bytes. */
    equalityProofBytes: Uint8Array;
    /** `BatchedGroupedCiphertext3HandlesValidity` proof bytes. */
    ciphertextValidityProofBytes: Uint8Array;
    /** `BatchedRangeProofU128` proof bytes. */
    rangeProofBytes: Uint8Array;
    /** The amount encrypted under the auditor pubkey — low half (64-byte ElGamal ct). */
    auditorCiphertextLo: Uint8Array;
    /** The amount encrypted under the auditor pubkey — high half (64-byte ElGamal ct). */
    auditorCiphertextHi: Uint8Array;
    /**
     * The new decryptable balance (36-byte AES ct): the mint's new decryptable
     * supply, or the burner's new decryptable available balance.
     */
    newDecryptableBalance: Uint8Array;
}

/** `[amount & (2^bitLength − 1), amount >> bitLength]`. */
function splitAmount(amount: bigint, bitLength: bigint): [bigint, bigint] {
    const mask = (1n << bitLength) - 1n;
    return [amount & mask, amount >> bitLength];
}

/** Tracks WASM objects so they can all be freed in a `finally`. */
interface Freeable {
    free?(): void;
}
function makeWasmTracker(): { track: <T extends Freeable>(o: T) => T; freeAll: () => void } {
    const objects: Freeable[] = [];
    return {
        track: <T extends Freeable>(o: T): T => {
            objects.push(o);
            return o;
        },
        // Free in reverse allocation order; ignore individual failures so one
        // bad free never masks another.
        freeAll: () => {
            for (let i = objects.length - 1; i >= 0; i--) {
                try {
                    objects[i].free?.();
                } catch {
                    /* best-effort */
                }
            }
        },
    };
}

export interface BuildMintProofDataInput {
    /** The mint's current confidential supply — 64-byte ElGamal ciphertext. */
    currentSupplyCiphertext: Uint8Array;
    /** The mint's current (decrypted) supply. */
    currentSupply: bigint;
    /** The amount to mint. */
    mintAmount: bigint;
    /** The mint authority's supply ElGamal keypair (backs the equality proof). */
    supplyElgamalKeypair: ElGamalKeypair;
    /** The mint authority's supply AES key (encrypts the new decryptable supply). */
    supplyAesKey: AeKey;
    /** The destination account's ElGamal public key (where the minted balance lands). */
    destinationElgamalPubkey: Address;
    /** The mint's auditor ElGamal public key, if any (defaults to the all-zero pubkey). */
    auditorElgamalPubkey?: Address;
}

/**
 * Generates the three proof-data objects for a confidential **mint**. Port of
 * `mint_split_proof_data` (`mint.rs`). Frees all WASM before returning bytes.
 */
export function buildMintProofData(input: BuildMintProofDataInput): MintBurnProofData {
    if (input.mintAmount <= 0n) {
        throw new Error('Mint amount must be positive.');
    }
    if (input.mintAmount > MAX_MINT_BURN_AMOUNT) {
        throw new Error(
            `Mint amount exceeds the maximum confidential mint/burn amount (2^48 - 1 = ${MAX_MINT_BURN_AMOUNT}).`,
        );
    }
    const newSupply = input.currentSupply + input.mintAmount;
    if (newSupply > U64_MAX) {
        throw new Error('Mint would overflow the maximum u64 supply.');
    }

    const { track, freeAll } = makeWasmTracker();
    try {
        const destinationPubkey = track(getElGamalPubkeyFromAddress(input.destinationElgamalPubkey));
        const auditorPubkey = track(
            input.auditorElgamalPubkey
                ? getElGamalPubkeyFromAddress(input.auditorElgamalPubkey)
                : getDefaultAuditorElGamalPubkey(),
        );
        const supplyPubkey = track(input.supplyElgamalKeypair.pubkey());

        const [amountLo, amountHi] = splitAmount(input.mintAmount, LO_BIT_LENGTH_BIGINT);
        const openingLo = track(new PedersenOpening());
        const openingHi = track(new PedersenOpening());

        // Grouped handle order for MINT: [destination, supply, auditor].
        const groupedLo = track(
            GroupedElGamalCiphertext3Handles.encryptWith(
                destinationPubkey,
                supplyPubkey,
                auditorPubkey,
                amountLo,
                openingLo,
            ),
        );
        const groupedHi = track(
            GroupedElGamalCiphertext3Handles.encryptWith(
                destinationPubkey,
                supplyPubkey,
                auditorPubkey,
                amountHi,
                openingHi,
            ),
        );
        const groupedLoBytes = groupedLo.toBytes();
        const groupedHiBytes = groupedHi.toBytes();

        // New supply ciphertext = current + combine_lo_hi(supply-handle components).
        const supplyCtLo = extractCiphertextFromGroupedBytes(groupedLoBytes, 1);
        const supplyCtHi = extractCiphertextFromGroupedBytes(groupedHiBytes, 1);
        const newSupplyCiphertextBytes = addCiphertexts(
            input.currentSupplyCiphertext,
            combineLoHiCiphertexts(supplyCtLo, supplyCtHi, LO_BIT_LENGTH_BIGINT),
        );
        const newSupplyCiphertext = track(requireCiphertext(newSupplyCiphertextBytes));

        const newSupplyOpening = track(new PedersenOpening());
        const newSupplyCommitment = track(PedersenCommitment.from(newSupply, newSupplyOpening));

        const equalityProof = track(
            new CiphertextCommitmentEqualityProofData(
                input.supplyElgamalKeypair,
                newSupplyCiphertext,
                newSupplyCommitment,
                newSupplyOpening,
                newSupply,
            ),
        );
        const validityProof = track(
            new BatchedGroupedCiphertext3HandlesValidityProofData(
                destinationPubkey,
                supplyPubkey,
                auditorPubkey,
                groupedLo,
                groupedHi,
                amountLo,
                amountHi,
                openingLo,
                openingHi,
            ),
        );

        const commitmentLo = track(PedersenCommitment.fromBytes(groupedLoBytes.slice(0, 32)));
        const commitmentHi = track(PedersenCommitment.fromBytes(groupedHiBytes.slice(0, 32)));
        const paddingOpening = track(new PedersenOpening());
        const paddingCommitment = track(PedersenCommitment.from(0n, paddingOpening));
        const rangeProof = track(
            new BatchedRangeProofU128Data(
                [newSupplyCommitment, commitmentLo, commitmentHi, paddingCommitment],
                new BigUint64Array([newSupply, amountLo, amountHi, 0n]),
                Uint8Array.from([
                    SUPPLY_OR_BALANCE_BIT_LENGTH,
                    AMOUNT_LO_BIT_LENGTH,
                    AMOUNT_HI_BIT_LENGTH,
                    RANGE_PROOF_PADDING_BIT_LENGTH,
                ]),
                [newSupplyOpening, openingLo, openingHi, paddingOpening],
            ),
        );

        return {
            equalityProofBytes: new Uint8Array(equalityProof.toBytes()),
            ciphertextValidityProofBytes: new Uint8Array(validityProof.toBytes()),
            rangeProofBytes: new Uint8Array(rangeProof.toBytes()),
            // Auditor ciphertext = handle index 2.
            auditorCiphertextLo: extractCiphertextFromGroupedBytes(groupedLoBytes, 2),
            auditorCiphertextHi: extractCiphertextFromGroupedBytes(groupedHiBytes, 2),
            newDecryptableBalance: encryptAes(input.supplyAesKey, newSupply),
        };
    } finally {
        freeAll();
    }
}

export interface BuildBurnProofDataInput {
    /** The account's current available balance — 64-byte ElGamal ciphertext. */
    currentAvailableBalanceCiphertext: Uint8Array;
    /** The account's current (decrypted) available balance. */
    currentAvailableBalance: bigint;
    /** The amount to burn. */
    burnAmount: bigint;
    /** The account owner's ElGamal keypair (backs the equality proof). */
    sourceElgamalKeypair: ElGamalKeypair;
    /** The account owner's AES key (encrypts the new decryptable available balance). */
    sourceAesKey: AeKey;
    /** The mint's supply ElGamal public key. */
    supplyElgamalPubkey: Address;
    /** The mint's auditor ElGamal public key, if any (defaults to the all-zero pubkey). */
    auditorElgamalPubkey?: Address;
}

/**
 * Generates the three proof-data objects for a confidential **burn**. Port of
 * `burn_split_proof_data` (`burn.rs`). Frees all WASM before returning bytes.
 */
export function buildBurnProofData(input: BuildBurnProofDataInput): MintBurnProofData {
    if (input.burnAmount <= 0n) {
        throw new Error('Burn amount must be positive.');
    }
    if (input.burnAmount > MAX_MINT_BURN_AMOUNT) {
        throw new Error(
            `Burn amount exceeds the maximum confidential mint/burn amount (2^48 - 1 = ${MAX_MINT_BURN_AMOUNT}).`,
        );
    }
    if (input.burnAmount > input.currentAvailableBalance) {
        throw new Error('Burn amount exceeds the available confidential balance.');
    }
    const remainingBalance = input.currentAvailableBalance - input.burnAmount;

    const { track, freeAll } = makeWasmTracker();
    try {
        const auditorPubkey = track(
            input.auditorElgamalPubkey
                ? getElGamalPubkeyFromAddress(input.auditorElgamalPubkey)
                : getDefaultAuditorElGamalPubkey(),
        );
        const supplyPubkey = track(getElGamalPubkeyFromAddress(input.supplyElgamalPubkey));
        const sourcePubkey = track(input.sourceElgamalKeypair.pubkey());

        const [amountLo, amountHi] = splitAmount(input.burnAmount, LO_BIT_LENGTH_BIGINT);
        const openingLo = track(new PedersenOpening());
        const openingHi = track(new PedersenOpening());

        // Grouped handle order for BURN: [source, supply, auditor].
        const groupedLo = track(
            GroupedElGamalCiphertext3Handles.encryptWith(
                sourcePubkey,
                supplyPubkey,
                auditorPubkey,
                amountLo,
                openingLo,
            ),
        );
        const groupedHi = track(
            GroupedElGamalCiphertext3Handles.encryptWith(
                sourcePubkey,
                supplyPubkey,
                auditorPubkey,
                amountHi,
                openingHi,
            ),
        );
        const groupedLoBytes = groupedLo.toBytes();
        const groupedHiBytes = groupedHi.toBytes();

        // New available balance ciphertext = current − combine_lo_hi(source-handle components).
        const sourceCtLo = extractCiphertextFromGroupedBytes(groupedLoBytes, 0);
        const sourceCtHi = extractCiphertextFromGroupedBytes(groupedHiBytes, 0);
        const newBalanceCiphertextBytes = subtractCiphertexts(
            input.currentAvailableBalanceCiphertext,
            combineLoHiCiphertexts(sourceCtLo, sourceCtHi, LO_BIT_LENGTH_BIGINT),
        );
        const newBalanceCiphertext = track(requireCiphertext(newBalanceCiphertextBytes));

        const newBalanceOpening = track(new PedersenOpening());
        const newBalanceCommitment = track(PedersenCommitment.from(remainingBalance, newBalanceOpening));

        const equalityProof = track(
            new CiphertextCommitmentEqualityProofData(
                input.sourceElgamalKeypair,
                newBalanceCiphertext,
                newBalanceCommitment,
                newBalanceOpening,
                remainingBalance,
            ),
        );
        const validityProof = track(
            new BatchedGroupedCiphertext3HandlesValidityProofData(
                sourcePubkey,
                supplyPubkey,
                auditorPubkey,
                groupedLo,
                groupedHi,
                amountLo,
                amountHi,
                openingLo,
                openingHi,
            ),
        );

        const commitmentLo = track(PedersenCommitment.fromBytes(groupedLoBytes.slice(0, 32)));
        const commitmentHi = track(PedersenCommitment.fromBytes(groupedHiBytes.slice(0, 32)));
        const paddingOpening = track(new PedersenOpening());
        const paddingCommitment = track(PedersenCommitment.from(0n, paddingOpening));
        const rangeProof = track(
            new BatchedRangeProofU128Data(
                [newBalanceCommitment, commitmentLo, commitmentHi, paddingCommitment],
                new BigUint64Array([remainingBalance, amountLo, amountHi, 0n]),
                Uint8Array.from([
                    SUPPLY_OR_BALANCE_BIT_LENGTH,
                    AMOUNT_LO_BIT_LENGTH,
                    AMOUNT_HI_BIT_LENGTH,
                    RANGE_PROOF_PADDING_BIT_LENGTH,
                ]),
                [newBalanceOpening, openingLo, openingHi, paddingOpening],
            ),
        );

        return {
            equalityProofBytes: new Uint8Array(equalityProof.toBytes()),
            ciphertextValidityProofBytes: new Uint8Array(validityProof.toBytes()),
            rangeProofBytes: new Uint8Array(rangeProof.toBytes()),
            auditorCiphertextLo: extractCiphertextFromGroupedBytes(groupedLoBytes, 2),
            auditorCiphertextHi: extractCiphertextFromGroupedBytes(groupedHiBytes, 2),
            newDecryptableBalance: encryptAes(input.sourceAesKey, remainingBalance),
        };
    } finally {
        freeAll();
    }
}

/**
 * Cheap consistency check: does `ciphertextBytes` (a 64-byte ElGamal supply or
 * balance ciphertext under `keypair`'s public key) encrypt `expected`?
 *
 * The decryptable (AES) supply/balance and its ElGamal ciphertext are two
 * encodings of the same value, but they can drift — most notably a mint's
 * decryptable supply after `applyPendingBurn`, which updates the on-chain
 * ElGamal supply ciphertext but cannot touch the AES form (the program has no
 * access to the supply AES key). Building a mint/burn equality proof against a
 * drifted value produces a proof the chain rejects with an opaque ZK error, so
 * callers use this to fail fast with a clear message instead.
 *
 * Runs without a full discrete-log solve: encrypt `expected` under the same
 * public key and homomorphically subtract it from `ciphertextBytes`. If the two
 * agree the difference is an encryption of `0`, which decrypts instantly; any
 * mismatch yields a large plaintext the bounded discrete-log solver rejects, so
 * this returns quickly (never hangs) in both the match and mismatch cases.
 */
export function elGamalCiphertextEncrypts(
    keypair: ElGamalKeypair,
    ciphertextBytes: Uint8Array,
    expected: bigint,
): boolean {
    const { track, freeAll } = makeWasmTracker();
    try {
        const pubkey = track(keypair.pubkey());
        const expectedCt = track(pubkey.encryptU64(expected));
        const diff = track(
            requireCiphertext(subtractCiphertexts(ciphertextBytes, new Uint8Array(expectedCt.toBytes()))),
        );
        const secret = track(keypair.secret());
        try {
            return secret.decrypt(diff) === 0n;
        } catch {
            // Bounded discrete-log solve failed → the difference is non-zero.
            return false;
        }
    } finally {
        freeAll();
    }
}

/** Decodes a 64-byte ElGamal ciphertext, throwing on malformed bytes. */
function requireCiphertext(bytes: Uint8Array): ElGamalCiphertext {
    const ciphertext = ElGamalCiphertext.fromBytes(bytes);
    if (!ciphertext) {
        throw new Error('Failed to decode a computed ElGamal ciphertext (expected 64 bytes).');
    }
    return ciphertext;
}

/** Encrypts `amount` under the AES key and returns the freed-safe 36-byte ciphertext. */
function encryptAes(aes: AeKey, amount: bigint): Uint8Array {
    const ciphertext = aes.encrypt(amount);
    try {
        return new Uint8Array(ciphertext.toBytes());
    } finally {
        ciphertext.free?.();
    }
}
