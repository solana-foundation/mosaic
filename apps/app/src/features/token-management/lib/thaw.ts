import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { getThawTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface ThawAccountOptions {
    tokenAccount: string;
    rpcUrl?: string;
}

export interface ThawAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
}

/**
 * Validates thaw account options
 * @param options - Thaw account configuration options
 * @throws Error if validation fails
 */
function validateThawAccountOptions(options: ThawAccountOptions): void {
    if (!options.tokenAccount) {
        throw new Error('Token account address is required');
    }

    if (!isAddress(options.tokenAccount)) {
        throw new Error('Invalid token account address format');
    }
}

/**
 * Thaws a frozen token account using the freeze authority
 * @param options - Configuration options for thawing
 * @param signer - Transaction sending signer instance (must be freeze authority)
 * @returns Promise that resolves to thaw result with signature and details
 */
export const thawTokenAccount = (
    options: ThawAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<ThawAccountResult> =>
    executeTokenAction<ThawAccountOptions, ThawAccountResult>({
        options,
        signer,
        validate: validateThawAccountOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            getThawTransaction({
                rpc,
                payer: signer,
                authority: signer,
                tokenAccount: options.tokenAccount as Address,
            }),
        buildSuccessResult: (_, options) => ({
            tokenAccount: options.tokenAccount,
        }),
    });
