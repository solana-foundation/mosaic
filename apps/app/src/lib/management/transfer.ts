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
import { createTransferTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export interface TransferTokensOptions {
    mintAddress: string;
    recipient: string;
    amount: string;
    memo?: string;
    rpcUrl?: string;
}

export interface TransferTokensResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    transferAmount?: string;
    recipient?: string;
}

/**
 * Validates transfer options
 * @param options - Transfer configuration options
 * @throws Error if validation fails
 */
function validateTransferOptions(options: TransferTokensOptions): void {
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
 * Transfers tokens from the connected wallet to a recipient
 * @param options - Configuration options for the transfer
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to transfer result with signature and details
 */
export const transferTokens = async (
    options: TransferTokensOptions,
    signer: TransactionModifyingSigner,
): Promise<TransferTokensResult> => {
    try {
        validateTransferOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create transfer transaction using SDK
        const transaction = await createTransferTransaction({
            rpc,
            mint: options.mintAddress as Address,
            from: signerAddress as Address,
            to: options.recipient as Address,
            feePayer: signer,
            authority: signer,
            amount: options.amount,
            memo: options.memo,
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            transferAmount: options.amount,
            recipient: options.recipient,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
