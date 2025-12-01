import {
    createSolanaRpc,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    TransactionModifyingSigner,
    isAddress,
} from 'gill';
import { createMintToTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

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
export const mintTokens = async (options: MintOptions, signer: TransactionModifyingSigner): Promise<MintResult> => {
    try {
        validateMintOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        // Set authorities (default to signer if not provided)
        const mintAuthorityAddress = options.mintAuthority || signerAddress;
        const feePayerAddress = options.feePayer || signerAddress;

        // Only allow minting if the wallet is the mint authority
        if (mintAuthorityAddress !== feePayerAddress) {
            throw new Error(
                'Only the mint authority can mint tokens. Please ensure the connected wallet is the mint authority.',
            );
        }

        // Use the wallet signer for both mint authority and fee payer
        const mintAuthority = signer;
        const feePayer = signer;

        // Create RPC client using standardized URL handling
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create mint transaction using SDK
        // The SDK internally fetches mint decimals and converts the amount
        const transaction = await createMintToTransaction(
            rpc,
            options.mintAddress as Address,
            options.recipient as Address,
            parseFloat(options.amount),
            mintAuthority,
            feePayer,
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            mintedAmount: options.amount,
            recipient: options.recipient,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
