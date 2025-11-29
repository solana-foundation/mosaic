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
import { getFreezeTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export interface FreezeAccountOptions {
    tokenAccount: string;
    rpcUrl?: string;
}

export interface FreezeAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
}

/**
 * Validates freeze account options
 * @param options - Freeze account configuration options
 * @throws Error if validation fails
 */
function validateFreezeAccountOptions(options: FreezeAccountOptions): void {
    if (!options.tokenAccount) {
        throw new Error('Token account address is required');
    }

    if (!isAddress(options.tokenAccount)) {
        throw new Error('Invalid token account address format');
    }
}

/**
 * Freezes a token account using the freeze authority
 * @param options - Configuration options for freezing
 * @param signer - Transaction sending signer instance (must be freeze authority)
 * @returns Promise that resolves to freeze result with signature and details
 */
export const freezeTokenAccount = async (
    options: FreezeAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<FreezeAccountResult> => {
    try {
        validateFreezeAccountOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        const transaction = await getFreezeTransaction({
            rpc,
            payer: signer,
            authority: signer,
            tokenAccount: options.tokenAccount as Address,
        });

        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            tokenAccount: options.tokenAccount,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
