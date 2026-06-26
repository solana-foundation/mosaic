import {
    type Address,
    type Commitment,
    type ReadonlyUint8Array,
    type Rpc,
    type SolanaRpcApi,
    getBase64Decoder,
} from '@solana/kit';
import {
    fetchConfidentialAccountState,
    type ConfidentialAccountState,
    type ConfidentialDecryptedBalances,
} from '../confidential/account-state';
import type { ConfidentialKeys } from '../confidential/keys';

/**
 * Account-level counterpart to {@link inspectToken}. The
 * `ConfidentialTransferAccount` extension lives on the **token account**, not
 * the mint, so it is invisible to `inspectToken` (which decodes the mint) and
 * needs this parallel inspection function. Kept separate to avoid bloating
 * `TokenInspectionResult` with account-scoped data.
 */

/** Display-friendly view of a confidential token account (ciphertexts base64-encoded). */
export interface ConfidentialAccountInfo {
    tokenAccount: Address;
    approved: boolean;
    elgamalPubkey: Address;
    allowConfidentialCredits: boolean;
    allowNonConfidentialCredits: boolean;
    pendingBalanceCreditCounter: bigint;
    maximumPendingBalanceCreditCounter: bigint;
    expectedPendingBalanceCreditCounter: bigint;
    actualPendingBalanceCreditCounter: bigint;
    /** Base64-encoded ciphertexts (always present). */
    ciphertexts: {
        pendingBalanceLow: string;
        pendingBalanceHigh: string;
        availableBalance: string;
        decryptableAvailableBalance: string;
    };
    /** Decrypted balances, present only when keys were supplied. */
    decrypted?: ConfidentialDecryptedBalances;
}

export interface InspectConfidentialAccountOptions {
    commitment?: Commitment;
    /**
     * Also decrypt the pending balance (ElGamal discrete log; can be slow).
     * Only applies when `keys` are supplied.
     */
    decryptPendingBalance?: boolean;
}

/**
 * Inspects the confidential-transfer state of a token account. Returns the
 * ciphertext fields always, and decrypted balances when `keys` are supplied.
 *
 * Returns `null` when the account does not exist, is not a Token-2022 account,
 * or has no `ConfidentialTransferAccount` extension.
 */
export async function inspectConfidentialAccount(
    rpc: Rpc<SolanaRpcApi>,
    tokenAccount: Address,
    keys?: ConfidentialKeys,
    options: InspectConfidentialAccountOptions = {},
): Promise<ConfidentialAccountInfo | null> {
    const state = await fetchConfidentialAccountState(rpc, tokenAccount, {
        commitment: options.commitment,
        keys,
        decryptPendingBalance: options.decryptPendingBalance,
    });

    if (!state) {
        return null;
    }

    return toConfidentialAccountInfo(state);
}

const base64 = getBase64Decoder();
const toBase64 = (bytes: ReadonlyUint8Array): string => base64.decode(new Uint8Array(bytes));

function toConfidentialAccountInfo(state: ConfidentialAccountState): ConfidentialAccountInfo {
    return {
        tokenAccount: state.tokenAccount,
        approved: state.approved,
        elgamalPubkey: state.elgamalPubkey,
        allowConfidentialCredits: state.allowConfidentialCredits,
        allowNonConfidentialCredits: state.allowNonConfidentialCredits,
        pendingBalanceCreditCounter: state.pendingBalanceCreditCounter,
        maximumPendingBalanceCreditCounter: state.maximumPendingBalanceCreditCounter,
        expectedPendingBalanceCreditCounter: state.expectedPendingBalanceCreditCounter,
        actualPendingBalanceCreditCounter: state.actualPendingBalanceCreditCounter,
        ciphertexts: {
            pendingBalanceLow: toBase64(state.ciphertexts.pendingBalanceLow),
            pendingBalanceHigh: toBase64(state.ciphertexts.pendingBalanceHigh),
            availableBalance: toBase64(state.ciphertexts.availableBalance),
            decryptableAvailableBalance: toBase64(state.ciphertexts.decryptableAvailableBalance),
        },
        decrypted: state.decrypted,
    };
}
