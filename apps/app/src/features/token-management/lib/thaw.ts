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
import { getThawTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export interface ThawAccountOptions {
    tokenAccount: string;
    rpcUrl?: string;
}

export interface ThawAccountResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    tokenAccount?: string;
}

/**
 * Validates thaw account options
 * @param options - Thaw account configuration options
 * @throws Error if validation fails
 */
function validateThawAccountOptions(options: ThawAccountOptions): void {
    if (!options.tokenAccount) {
        throw new Error('Token account address is required');
    }

    if (!isAddress(options.tokenAccount)) {
        throw new Error('Invalid token account address format');
    }
}

/**
 * Thaws a frozen token account using the freeze authority
 * @param options - Configuration options for thawing
 * @param signer - Transaction sending signer instance (must be freeze authority)
 * @returns Promise that resolves to thaw result with signature and details
 */
export const thawTokenAccount = async (
    options: ThawAccountOptions,
    signer: TransactionModifyingSigner,
): Promise<ThawAccountResult> => {
    try {
        validateThawAccountOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        const transaction = await getThawTransaction({
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
