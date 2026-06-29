import {
    type Address,
    type Commitment,
    type ReadonlyUint8Array,
    type Rpc,
    type SolanaRpcApi,
    fetchEncodedAccount,
} from '@solana/kit';
import { decodeToken, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { type ConfidentialKeys, decryptAesBalance, decryptElGamalBalance } from './keys';

/**
 * Reads the `ConfidentialTransferAccount` extension that lives on a **token
 * account** (not the mint — so it is invisible to `inspectToken`, which decodes
 * the mint). Decoding is pure (token-2022 only, no WASM); decryption is
 * delegated to `keys.ts`, keeping the WASM crypto dependency isolated.
 */

/** Raw ciphertext fields from the extension (always available, no keys needed). */
export interface ConfidentialAccountCiphertexts {
    /** Low 16 bits of the pending balance — 64-byte ElGamal ciphertext. */
    pendingBalanceLow: ReadonlyUint8Array;
    /** High 48 bits of the pending balance — 64-byte ElGamal ciphertext. */
    pendingBalanceHigh: ReadonlyUint8Array;
    /** Available balance — 64-byte ElGamal ciphertext. */
    availableBalance: ReadonlyUint8Array;
    /** Available balance in AES form — 36-byte ciphertext (cheap to decrypt). */
    decryptableAvailableBalance: ReadonlyUint8Array;
}

/** Decrypted balances, present only when keys are supplied. */
export interface ConfidentialDecryptedBalances {
    /** Available balance, decrypted from the AES decryptable balance (fast, exact). */
    availableBalance: bigint;
    /**
     * Pending balance = low + (high << 16), via ElGamal discrete log. Present
     * only when `decryptPendingBalance` is requested (it can be slow).
     */
    pendingBalance?: bigint;
}

/** Decoded `ConfidentialTransferAccount` extension state. */
export interface ConfidentialAccountState {
    /** The token account this state was read from. */
    tokenAccount: Address;
    /**
     * Whether the account is approved for confidential transfers. All
     * confidential ops fail until this is `true` (auto-approved at configure
     * time when the mint sets `autoApproveNewAccounts`).
     */
    approved: boolean;
    /** ElGamal public key the balances are encrypted under. */
    elgamalPubkey: Address;
    /** If `false`, the account rejects incoming confidential transfers. */
    allowConfidentialCredits: boolean;
    /** If `false`, the base account rejects incoming (non-confidential) transfers. */
    allowNonConfidentialCredits: boolean;
    /** Deposits + transfers that have credited the pending balance. */
    pendingBalanceCreditCounter: bigint;
    /** Max pending credits before `ApplyPendingBalance` must be run. */
    maximumPendingBalanceCreditCounter: bigint;
    /** The `expected_pending_balance_credit_counter` from the last apply. */
    expectedPendingBalanceCreditCounter: bigint;
    /** The actual `pending_balance_credit_counter` at the last apply. */
    actualPendingBalanceCreditCounter: bigint;
    /** Raw ciphertexts (always present). */
    ciphertexts: ConfidentialAccountCiphertexts;
    /** Decrypted balances (present only when keys were supplied). */
    decrypted?: ConfidentialDecryptedBalances;
}

export interface FetchConfidentialAccountStateOptions {
    commitment?: Commitment;
    /** When supplied, decrypts balances and populates `decrypted`. */
    keys?: ConfidentialKeys;
    /**
     * Also decrypt the pending balance via ElGamal discrete log. Off by default
     * because high pending balances can be slow to decrypt.
     */
    decryptPendingBalance?: boolean;
}

/**
 * Fetches and decodes the `ConfidentialTransferAccount` extension on a token
 * account, optionally decrypting balances when `keys` are supplied.
 *
 * Returns `null` when the account does not exist, is not a Token-2022 account,
 * or has no confidential-transfer extension.
 */
export async function fetchConfidentialAccountState(
    rpc: Rpc<SolanaRpcApi>,
    tokenAccount: Address,
    options: FetchConfidentialAccountStateOptions = {},
): Promise<ConfidentialAccountState | null> {
    const encodedAccount = await fetchEncodedAccount(rpc, tokenAccount, {
        commitment: options.commitment ?? 'confirmed',
    });

    if (!encodedAccount.exists || encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        return null;
    }

    const decoded = decodeToken(encodedAccount);
    if (decoded.data.extensions.__option !== 'Some') {
        return null;
    }

    const ext = decoded.data.extensions.value.find(
        (e): e is Extract<typeof e, { __kind: 'ConfidentialTransferAccount' }> =>
            e.__kind === 'ConfidentialTransferAccount',
    );
    if (!ext) {
        return null;
    }

    const state: ConfidentialAccountState = {
        tokenAccount,
        approved: ext.approved,
        elgamalPubkey: ext.elgamalPubkey,
        allowConfidentialCredits: ext.allowConfidentialCredits,
        allowNonConfidentialCredits: ext.allowNonConfidentialCredits,
        pendingBalanceCreditCounter: ext.pendingBalanceCreditCounter,
        maximumPendingBalanceCreditCounter: ext.maximumPendingBalanceCreditCounter,
        expectedPendingBalanceCreditCounter: ext.expectedPendingBalanceCreditCounter,
        actualPendingBalanceCreditCounter: ext.actualPendingBalanceCreditCounter,
        ciphertexts: {
            pendingBalanceLow: ext.pendingBalanceLow,
            pendingBalanceHigh: ext.pendingBalanceHigh,
            availableBalance: ext.availableBalance,
            decryptableAvailableBalance: ext.decryptableAvailableBalance,
        },
    };

    if (options.keys) {
        state.decrypted = decryptConfidentialBalances(state, options.keys, {
            decryptPendingBalance: options.decryptPendingBalance,
        });
    }

    return state;
}

/**
 * Decrypts the balances of an already-decoded {@link ConfidentialAccountState}.
 * Always decrypts the available balance (cheap AES path); decrypts the pending
 * balance only when `decryptPendingBalance` is set (ElGamal discrete log).
 */
export function decryptConfidentialBalances(
    state: ConfidentialAccountState,
    keys: ConfidentialKeys,
    options: { decryptPendingBalance?: boolean } = {},
): ConfidentialDecryptedBalances {
    const availableBalance = decryptAesBalance(keys.aes, new Uint8Array(state.ciphertexts.decryptableAvailableBalance));

    const decrypted: ConfidentialDecryptedBalances = { availableBalance };

    if (options.decryptPendingBalance) {
        const low = decryptElGamalBalance(keys.elgamal, new Uint8Array(state.ciphertexts.pendingBalanceLow));
        const high = decryptElGamalBalance(keys.elgamal, new Uint8Array(state.ciphertexts.pendingBalanceHigh));
        decrypted.pendingBalance = low + (high << 16n);
    }

    return decrypted;
}
