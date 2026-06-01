export type ConfidentialSupportedCapability = { supported: true };
export type ConfidentialUnsupportedCapability = { supported: false; reason: string };

export type ConfidentialTransferFeeCapability = {
    harvestWithheldFeesToMint: ConfidentialSupportedCapability;
    transferWithFee: ConfidentialUnsupportedCapability;
    withdrawWithheldFeesFromMint: ConfidentialUnsupportedCapability;
    withdrawWithheldFeesFromAccounts: ConfidentialUnsupportedCapability;
};

const TRANSFER_WITH_FEE_REASON =
    'Confidential transfers with transfer fees require fee sigma and U256 range proofs that @solana/zk-sdk 0.4.2 cannot generate because it does not expose Pedersen opening arithmetic.';

const WITHDRAW_FEES_FROM_MINT_REASON =
    'Withdrawing confidential withheld fees requires a ciphertext-ciphertext equality proof over the configured withdraw-withheld ElGamal key. Mosaic cannot derive that key safely from the authority signer yet; provide upstream SDK key-derivation support before enabling this flow.';

const WITHDRAW_FEES_FROM_ACCOUNTS_REASON =
    'Withdrawing confidential withheld fees from accounts requires an aggregate withheld-fee equality proof over the configured withdraw-withheld ElGamal key. Mosaic cannot derive that key safely from the authority signer yet; provide upstream SDK key-derivation support before enabling this flow.';

export function getConfidentialTransferFeeCapability(): ConfidentialTransferFeeCapability {
    return {
        harvestWithheldFeesToMint: {
            supported: true,
        },
        transferWithFee: {
            supported: false,
            reason: TRANSFER_WITH_FEE_REASON,
        },
        withdrawWithheldFeesFromMint: {
            supported: false,
            reason: WITHDRAW_FEES_FROM_MINT_REASON,
        },
        withdrawWithheldFeesFromAccounts: {
            supported: false,
            reason: WITHDRAW_FEES_FROM_ACCOUNTS_REASON,
        },
    };
}

export function calculateTransferFee(
    transferAmount: bigint,
    transferFeeBasisPoints: number,
    maximumFee: bigint,
): { feeAmount: bigint; netAmount: bigint } {
    if (!Number.isInteger(transferFeeBasisPoints) || transferFeeBasisPoints < 0 || transferFeeBasisPoints > 10_000) {
        throw new Error('Transfer fee basis points must be an integer from 0 to 10000');
    }
    const rawFee = (transferAmount * BigInt(transferFeeBasisPoints) + 9_999n) / 10_000n;
    const feeAmount = rawFee > maximumFee ? maximumFee : rawFee;
    if (feeAmount > transferAmount) {
        throw new Error('Calculated transfer fee exceeds transfer amount');
    }
    return { feeAmount, netAmount: transferAmount - feeAmount };
}

export function unsupportedTransferWithFeeMessage(feeAmount: bigint, netAmount: bigint): string {
    return `${getConfidentialTransferFeeCapability().transferWithFee.reason} Calculated fee would be ${feeAmount} raw units and net amount would be ${netAmount} raw units.`;
}

export function unsupportedWithdrawFeesFromMintMessage(): string {
    return getConfidentialTransferFeeCapability().withdrawWithheldFeesFromMint.reason;
}

export function unsupportedWithdrawFeesFromAccountsMessage(): string {
    return getConfidentialTransferFeeCapability().withdrawWithheldFeesFromAccounts.reason;
}

export function assertConfidentialTransferWithFeeProofSupport(input: { feeAmount: bigint; netAmount: bigint }): never {
    throw new Error(unsupportedTransferWithFeeMessage(input.feeAmount, input.netAmount));
}

export function assertWithdrawConfidentialTransferFeesFromMintSupport(): never {
    throw new Error(unsupportedWithdrawFeesFromMintMessage());
}

export function assertWithdrawConfidentialTransferFeesFromAccountsSupport(): never {
    throw new Error(unsupportedWithdrawFeesFromAccountsMessage());
}
