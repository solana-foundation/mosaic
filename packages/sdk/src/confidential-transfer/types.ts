import type { Address, KeyPairSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
export type { ConfidentialTransferAuthoritySigner } from './authority';

export type ConfidentialTransferContextStateAccounts = {
    equality: KeyPairSigner;
    ciphertextValidity: KeyPairSigner;
    range: KeyPairSigner;
};

export type ConfidentialTransferWithFeeContextStateAccounts = {
    equality: KeyPairSigner;
    transferAmountCiphertextValidity: KeyPairSigner;
    feeSigma: KeyPairSigner;
    feeCiphertextValidity: KeyPairSigner;
    range: KeyPairSigner;
};

export type ConfidentialTransferFeeWithdrawContextStateAccounts = {
    equality: KeyPairSigner;
};

export type ConfidentialTransferPlan = {
    sourceTokenAccount: Address;
    destinationTokenAccount: Address;
    contextStateAccounts: {
        equality: Address;
        ciphertextValidity: Address;
        range: Address;
    };
    setupTransactions: FullTransaction[];
    transferTransaction: FullTransaction;
    cleanupTransactions?: FullTransaction[];
    cleanupTransaction: FullTransaction;
};

export type ConfidentialTransferWithFeePlan = {
    sourceTokenAccount: Address;
    destinationTokenAccount: Address;
    contextStateAccounts: {
        equality: Address;
        transferAmountCiphertextValidity: Address;
        feeSigma: Address;
        feeCiphertextValidity: Address;
        range: Address;
    };
    setupTransactions: FullTransaction[];
    transferTransaction: FullTransaction;
    cleanupTransactions?: FullTransaction[];
    cleanupTransaction: FullTransaction;
    feeAmount: bigint;
    netAmount: bigint;
};

export type ConfidentialTransferFeeWithdrawPlan = {
    destinationTokenAccount: Address;
    contextStateAccount: Address;
    setupTransactions: FullTransaction[];
    withdrawTransaction: FullTransaction;
    cleanupTransactions?: FullTransaction[];
    cleanupTransaction: FullTransaction;
};

export type ConfidentialTransferBalances = {
    tokenAccount: Address;
    publicBalance: bigint;
    pendingBalance: bigint;
    availableBalance: bigint;
    approved: boolean;
    allowConfidentialCredits: boolean;
    allowNonConfidentialCredits: boolean;
    pendingBalanceCreditCounter: bigint;
    maximumPendingBalanceCreditCounter: bigint;
};

export type ConfidentialTransferAccountStatus = {
    tokenAccount: Address;
    exists: boolean;
    configured: boolean;
    publicBalance: bigint;
    approved: boolean | null;
    elgamalPubkey: Address | null;
    allowConfidentialCredits: boolean | null;
    allowNonConfidentialCredits: boolean | null;
    pendingBalanceCreditCounter: bigint | null;
    maximumPendingBalanceCreditCounter: bigint | null;
};
