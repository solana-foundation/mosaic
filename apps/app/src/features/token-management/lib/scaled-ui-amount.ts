import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createUpdateScaledUiMultiplierTransaction } from '@solana/mosaic-sdk';
import { executeTokenAction } from './token-action';

export interface UpdateScaledUiMultiplierOptions {
    mint: string;
    multiplier: number;
    rpcUrl?: string;
}

export interface UpdateScaledUiMultiplierResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    multiplier?: number;
}

function validateUpdateScaledUiMultiplierOptions(options: UpdateScaledUiMultiplierOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }
    if (!isAddress(options.mint)) {
        throw new Error('Invalid mint address format');
    }
    if (!Number.isFinite(options.multiplier) || options.multiplier <= 0) {
        throw new Error('Multiplier must be a positive number');
    }
}

/**
 * Updates a mint's Scaled UI Amount multiplier, effective immediately. The connected wallet
 * signs as both the scaled UI amount authority and the fee payer.
 */
export const updateScaledUiMultiplier = (
    options: UpdateScaledUiMultiplierOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateScaledUiMultiplierResult> =>
    executeTokenAction<UpdateScaledUiMultiplierOptions, UpdateScaledUiMultiplierResult>({
        options,
        signer,
        validate: validateUpdateScaledUiMultiplierOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            createUpdateScaledUiMultiplierTransaction(rpc, {
                mint: options.mint as Address,
                authority: signer,
                multiplier: options.multiplier,
                feePayer: signer,
            }),
        buildSuccessResult: (_, options) => ({
            multiplier: options.multiplier,
        }),
    });
