import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createTransferTransaction } from '@solana/mosaic-sdk';
import { executeTokenAction } from './token-action';

export interface TransferTokensOptions {
    mintAddress: string;
    recipient: string;
    amount: string;
    memo?: string;
    rpcUrl?: string;
}

export interface TransferTokensResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    transferAmount?: string;
    recipient?: string;
}

/**
 * Validates transfer options
 * @param options - Transfer configuration options
 * @throws Error if validation fails
 */
function validateTransferOptions(options: TransferTokensOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }
    if (!options.recipient) {
        throw new Error('Recipient address is required');
    }
    if (!options.amount) {
        throw new Error('Amount is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
    if (!isAddress(options.recipient)) {
        throw new Error('Invalid recipient address format');
    }

    const amount = parseFloat(options.amount);
    if (isNaN(amount)) {
        throw new Error('Amount must be a valid number');
    }
    if (amount <= 0) {
        throw new Error('Amount must be greater than zero');
    }
}

/**
 * Transfers tokens from the connected wallet to a recipient
 * @param options - Configuration options for the transfer
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to transfer result with signature and details
 */
export const transferTokens = (
    options: TransferTokensOptions,
    signer: TransactionModifyingSigner,
): Promise<TransferTokensResult> =>
    executeTokenAction<TransferTokensOptions, TransferTokensResult>({
        options,
        signer,
        validate: validateTransferOptions,
        buildTransaction: async ({ rpc, signer, signerAddress, options }) =>
            createTransferTransaction({
                rpc,
                mint: options.mintAddress as Address,
                from: signerAddress,
                to: options.recipient as Address,
                feePayer: signer,
                authority: signer,
                amount: options.amount,
                memo: options.memo,
            }),
        buildSuccessResult: (_, options) => ({
            transferAmount: options.amount,
            recipient: options.recipient,
        }),
    });
