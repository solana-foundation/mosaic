import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createMintToTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export interface MintOptions {
    mintAddress: string;
    recipient: string;
    amount: string;
    mintAuthority?: string;
    feePayer?: string;
    rpcUrl?: string;
}

export interface MintResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    mintedAmount?: string;
    recipient?: string;
}

/**
 * Validates mint options
 * @param options - Mint configuration options
 * @throws Error if validation fails
 */
function validateMintOptions(options: MintOptions): void {
    if (!options.mintAddress || !options.recipient || !options.amount) {
        throw new Error('Mint address, recipient, and amount are required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }
    if (!isAddress(options.recipient)) {
        throw new Error('Invalid recipient address format');
    }

    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Mints tokens to a recipient using the wallet standard transaction signer.
 * The SDK's createMintToTransaction internally fetches mint decimals and
 * converts the amount appropriately.
 *
 * @param options - Configuration options for minting
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to mint result with signature and details
 */
export const mintTokens = (options: MintOptions, signer: TransactionModifyingSigner): Promise<MintResult> =>
    executeTokenAction<MintOptions, MintResult>({
        options,
        signer,
        validate: opts => {
            validateMintOptions(opts);

            // Additional authority validation
            const signerAddress = signer.address;
            const mintAuthorityAddress = opts.mintAuthority || signerAddress;

            if (signerAddress.toLowerCase() !== (mintAuthorityAddress || signerAddress).toLowerCase()) {
                throw new Error(
                    'Only the mint authority can mint tokens. Please ensure the connected wallet is the mint authority.',
                );
            }
        },
        buildTransaction: async ({ rpc, signer, options }) =>
            createMintToTransaction(
                rpc,
                options.mintAddress as Address,
                options.recipient as Address,
                parseFloat(options.amount),
                signer, // mintAuthority
                signer, // feePayer
            ),
        buildSuccessResult: (_, options) => ({
            mintedAmount: options.amount,
            recipient: options.recipient,
        }),
    });
