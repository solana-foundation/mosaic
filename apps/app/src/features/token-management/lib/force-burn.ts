import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createForceBurnTransaction, validatePermanentDelegateForBurn } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface ForceBurnOptions {
    mintAddress: string;
    fromAddress: string;
    amount: string;
    permanentDelegate?: string;
    feePayer?: string;
    rpcUrl?: string;
}

export interface ForceBurnResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    burnAmount?: string;
    fromAddress?: string;
}

/**
 * Validates force burn options
 * @param options - Force burn configuration options
 * @throws Error if validation fails
 */
function validateForceBurnOptions(options: ForceBurnOptions): void {
    if (!options.mintAddress || !options.fromAddress || !options.amount) {
        throw new Error('Mint address, from address, and amount are required');
    }

    // Validate Solana address format
    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
    if (!isAddress(options.fromAddress)) {
        throw new Error('Invalid source address format');
    }

    // Validate amount is a positive number
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Force burns tokens using the permanent delegate extension
 * @param options - Configuration options for force burn
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to force burn result with signature and details
 */
export const forceBurnTokens = (
    options: ForceBurnOptions,
    signer: TransactionModifyingSigner,
): Promise<ForceBurnResult> =>
    executeTokenAction<ForceBurnOptions, ForceBurnResult>({
        options,
        signer,
        validate: opts => {
            validateForceBurnOptions(opts);

            const signerAddress = signer.address;
            const permanentDelegateAddress = opts.permanentDelegate || signerAddress;

            if (permanentDelegateAddress !== signerAddress) {
                throw new Error(
                    'Only the permanent delegate can force burn tokens. Please ensure the connected wallet has permanent delegate authority.',
                );
            }
        },
        buildTransaction: async ({ rpc, signer, signerAddress, options }) => {
            // Validate that the mint has permanent delegate extension and it matches our signer
            await validatePermanentDelegateForBurn(rpc, options.mintAddress as Address, signerAddress);

            return createForceBurnTransaction(
                rpc,
                options.mintAddress as Address,
                options.fromAddress as Address,
                parseFloat(options.amount),
                signer, // permanentDelegate
                signer, // feePayer
            );
        },
        buildSuccessResult: (_, options) => ({
            burnAmount: options.amount,
            fromAddress: options.fromAddress,
        }),
    });
