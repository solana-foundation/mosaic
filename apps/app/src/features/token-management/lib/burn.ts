import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { createBurnTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface BurnOptions {
    mintAddress: string;
    amount: string;
    rpcUrl?: string;
}

export interface BurnResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    burnedAmount?: string;
}

/**
 * Validates burn options
 * @param options - Burn configuration options
 * @throws Error if validation fails
 */
function validateBurnOptions(options: BurnOptions): void {
    if (!options.mintAddress || !options.amount) {
        throw new Error('Mint address and amount are required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Burns tokens from the connected wallet.
 * This is a self-burn operation - the wallet owner burns their own tokens.
 *
 * @param options - Configuration options for burning
 * @param signer - Transaction sending signer instance (token owner)
 * @returns Promise that resolves to burn result with signature and details
 */
export const burnTokens = (options: BurnOptions, signer: TransactionModifyingSigner): Promise<BurnResult> =>
    executeTokenAction<BurnOptions, BurnResult>({
        options,
        signer,
        validate: validateBurnOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            createBurnTransaction(rpc, options.mintAddress as Address, signer, parseFloat(options.amount), signer),
        buildSuccessResult: (_, options) => ({
            burnedAmount: options.amount,
        }),
    });
