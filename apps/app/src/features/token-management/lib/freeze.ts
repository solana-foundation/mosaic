import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { getFreezeWalletTransaction } from '@solana/mosaic-sdk';
import { executeTokenAction } from './token-action';

export interface FreezeAccountOptions {
    /** Wallet address whose token account should be frozen */
    walletAddress: string;
    /** The mint address of the token */
    mintAddress: string;
    rpcUrl?: string;
}

export interface FreezeAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
    walletAddress?: string;
}

/**
 * Validates freeze account options
 * @param options - Freeze account configuration options
 * @throws Error if validation fails
 */
function validateFreezeAccountOptions(options: FreezeAccountOptions): void {
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
 * Freezes a token account using the freeze authority
 * @param options - Configuration options for freezing (wallet address + mint)
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
        buildTransaction: ({ rpc, signer, options }) =>
            getFreezeWalletTransaction({
                rpc,
                payer: signer,
                authority: signer,
                wallet: options.walletAddress as Address,
                mint: options.mintAddress as Address,
            }),
        buildSuccessResult: (_, options) => ({
            walletAddress: options.walletAddress,
        }),
    });
