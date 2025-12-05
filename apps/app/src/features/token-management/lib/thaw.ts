import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { getAssociatedTokenAccountAddress, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs';
import { getThawTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface ThawAccountOptions {
    /** Wallet address whose token account should be thawed */
    walletAddress: string;
    /** The mint address of the token */
    mintAddress: string;
    rpcUrl?: string;
}

export interface ThawAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
    walletAddress?: string;
}

/**
 * Validates thaw account options
 * @param options - Thaw account configuration options
 * @throws Error if validation fails
 */
function validateThawAccountOptions(options: ThawAccountOptions): void {
    if (!options.walletAddress) {
        throw new Error('Wallet address is required');
    }

    if (!isAddress(options.walletAddress)) {
        throw new Error('Invalid wallet address format');
    }

    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
}

/**
 * Thaws a frozen token account using the freeze authority
 * @param options - Configuration options for thawing (wallet address + mint)
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
        buildTransaction: async ({ rpc, signer, options }) => {
            // Derive the Associated Token Account from wallet + mint
            const tokenAccount = await getAssociatedTokenAccountAddress(
                options.mintAddress as Address,
                options.walletAddress as Address,
                TOKEN_2022_PROGRAM_ADDRESS,
            );

            return getThawTransaction({
                rpc,
                payer: signer,
                authority: signer,
                tokenAccount,
            });
        },
        buildSuccessResult: (_, options) => ({
            walletAddress: options.walletAddress,
        }),
    });
