import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { createCloseAccountTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface CloseAccountOptions {
    mintAddress: string;
    destination?: string; // Address to send reclaimed SOL, defaults to wallet
    rpcUrl?: string;
}

export interface CloseAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    closedAccount?: string;
    destination?: string;
}

/**
 * Validates close account options
 * @param options - Close account configuration options
 * @throws Error if validation fails
 */
function validateCloseAccountOptions(options: CloseAccountOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    if (options.destination && !isAddress(options.destination)) {
        throw new Error('Invalid destination address format');
    }
}

/**
 * Closes an empty token account and reclaims the rent.
 * The token account must have a zero balance.
 *
 * @param options - Configuration options for closing the account
 * @param signer - Transaction sending signer instance (must be token account owner)
 * @returns Promise that resolves to close result with signature and details
 */
export const closeTokenAccount = (
    options: CloseAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<CloseAccountResult> =>
    executeTokenAction<CloseAccountOptions, CloseAccountResult>({
        options,
        signer,
        validate: validateCloseAccountOptions,
        buildTransaction: async ({ rpc, signer, signerAddress, options }) =>
            createCloseAccountTransaction(
                rpc,
                options.mintAddress as Address,
                signer,
                (options.destination || signerAddress) as Address,
                signer,
            ),
        buildSuccessResult: (_, options, signerAddress) => ({
            closedAccount: options.mintAddress,
            destination: options.destination || signerAddress,
        }),
    });
