import { type Address, type TransactionModifyingSigner, isAddress } from 'gill';
import { createForceTransferTransaction, validatePermanentDelegate } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface ForceTransferOptions {
    mintAddress: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    permanentDelegate?: string;
    feePayer?: string;
    rpcUrl?: string;
}

export interface ForceTransferResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    transferAmount?: string;
    fromAddress?: string;
    toAddress?: string;
}

/**
 * Validates force transfer options
 * @param options - Force transfer configuration options
 * @throws Error if validation fails
 */
function validateForceTransferOptions(options: ForceTransferOptions): void {
    if (!options.mintAddress || !options.fromAddress || !options.toAddress || !options.amount) {
        throw new Error('Mint address, from address, to address, and amount are required');
    }

    // Validate Solana address format
    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
    if (!isAddress(options.fromAddress)) {
        throw new Error('Invalid source address format');
    }
    if (!isAddress(options.toAddress)) {
        throw new Error('Invalid destination address format');
    }

    // Validate amount is a positive number
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Force transfers tokens using the permanent delegate extension
 * @param options - Configuration options for force transfer
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to force transfer result with signature and details
 */
export const forceTransferTokens = (
    options: ForceTransferOptions,
    signer: TransactionModifyingSigner,
): Promise<ForceTransferResult> =>
    executeTokenAction<ForceTransferOptions, ForceTransferResult>({
        options,
        signer,
        validate: opts => {
            validateForceTransferOptions(opts);

            const signerAddress = signer.address;
            const permanentDelegateAddress = opts.permanentDelegate || signerAddress;

            if (permanentDelegateAddress !== signerAddress) {
                throw new Error(
                    'Only the permanent delegate can force transfer tokens. Please ensure the connected wallet has permanent delegate authority.',
                );
            }
        },
        buildTransaction: async ({ rpc, signer, signerAddress, options }) => {
            // Validate that the mint has permanent delegate extension and it matches our signer
            await validatePermanentDelegate(rpc, options.mintAddress as Address, signerAddress);

            return createForceTransferTransaction(
                rpc,
                options.mintAddress as Address,
                options.fromAddress as Address,
                options.toAddress as Address,
                parseFloat(options.amount),
                signer, // permanentDelegate
                signer, // feePayer
            );
        },
        buildSuccessResult: (_, options) => ({
            transferAmount: options.amount,
            fromAddress: options.fromAddress,
            toAddress: options.toAddress,
        }),
    });
