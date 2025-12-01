import {
    createSolanaRpc,
    createTransaction,
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
import { TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { createUpdateFieldInstruction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export interface UpdateMetadataOptions {
    mintAddress: string;
    field: 'name' | 'symbol' | 'uri';
    value: string;
    rpcUrl?: string;
}

export interface UpdateMetadataResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    field?: string;
    newValue?: string;
}

/**
 * Validates metadata update options
 * @param options - Metadata update configuration options
 * @throws Error if validation fails
 */
function validateUpdateMetadataOptions(options: UpdateMetadataOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    if (!options.field) {
        throw new Error('Field to update is required');
    }

    if (!['name', 'symbol', 'uri'].includes(options.field)) {
        throw new Error('Invalid field. Must be name, symbol, or uri');
    }

    if (options.value === undefined || options.value === null) {
        throw new Error('New value is required');
    }

    // Validate field-specific constraints
    if (options.field === 'name' && options.value.length > 32) {
        throw new Error('Name must be 32 characters or less');
    }
    if (options.field === 'symbol' && options.value.length > 10) {
        throw new Error('Symbol must be 10 characters or less');
    }
    if (options.field === 'uri' && options.value.length > 200) {
        throw new Error('URI must be 200 characters or less');
    }
}

/**
 * Updates token metadata (name, symbol, or URI).
 * Requires the connected wallet to be the metadata update authority.
 *
 * @param options - Configuration options for the metadata update
 * @param signer - Transaction sending signer instance (must be metadata authority)
 * @returns Promise that resolves to update result with signature and details
 */
export const updateTokenMetadata = async (
    options: UpdateMetadataOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateMetadataResult> => {
    try {
        validateUpdateMetadataOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create update field instruction
        const updateInstruction = createUpdateFieldInstruction({
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            metadata: options.mintAddress as Address,
            updateAuthority: walletPublicKey as Address,
            field: options.field,
            value: options.value,
        });

        // Get latest blockhash
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        // Create transaction
        const transaction = createTransaction({
            feePayer: signer,
            version: 'legacy',
            latestBlockhash,
            instructions: [updateInstruction],
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            field: options.field,
            newValue: options.value,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
