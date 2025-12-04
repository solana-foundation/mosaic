import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { getFreezeTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface FreezeAccountOptions {
    tokenAccount: string;
    rpcUrl?: string;
}

export interface FreezeAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
}

/**
 * Validates freeze account options
 * @param options - Freeze account configuration options
 * @throws Error if validation fails
 */
function validateFreezeAccountOptions(options: FreezeAccountOptions): void {
    if (!options.tokenAccount) {
        throw new Error('Token account address is required');
    }

    if (!isAddress(options.tokenAccount)) {
        throw new Error('Invalid token account address format');
    }
}

/**
 * Freezes a token account using the freeze authority
 * @param options - Configuration options for freezing
 * @param signer - Transaction sending signer instance (must be freeze authority)
 * @returns Promise that resolves to freeze result with signature and details
 */
export const freezeTokenAccount = (
    options: FreezeAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<FreezeAccountResult> =>
    executeTokenAction<FreezeAccountOptions, FreezeAccountResult>({
        options,
        signer,
        validate: validateFreezeAccountOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            getFreezeTransaction({
                rpc,
                payer: signer,
                authority: signer,
                tokenAccount: options.tokenAccount as Address,
            }),
        buildSuccessResult: (_, options) => ({
            tokenAccount: options.tokenAccount,
        }),
    });
