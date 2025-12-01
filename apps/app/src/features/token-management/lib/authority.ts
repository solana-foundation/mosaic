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
} from 'gill';
import { AuthorityType } from 'gill/programs/token';
import { getUpdateAuthorityTransaction, getRemoveAuthorityTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl } from '@/lib/solana/rpc';

export type AuthorityRole = AuthorityType | 'Metadata';

export interface UpdateAuthorityOptions {
    mint: string;
    role: AuthorityRole;
    newAuthority: string;
    rpcUrl?: string;
}

export interface UpdateAuthorityResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    authorityRole?: string;
    prevAuthority?: string;
    newAuthority?: string;
}

/**
 * Validates authority update options
 * @param options - Authority update configuration options
 * @throws Error if validation fails
 */
function validateUpdateAuthorityOptions(options: UpdateAuthorityOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }

    if (!options.newAuthority) {
        throw new Error('New authority address is required');
    }

    if (options.role === undefined || options.role === null) {
        throw new Error('Authority role is required');
    }

    // Basic address format validation
    if (options.mint.length < 32 || options.newAuthority.length < 32) {
        throw new Error('Invalid address format');
    }
}

/**
 * Updates the authority for a given mint and role
 * @param options - Configuration options for the authority update
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to update result with signature and authority details
 */
export const updateTokenAuthority = async (
    options: UpdateAuthorityOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateAuthorityResult> => {
    try {
        validateUpdateAuthorityOptions(options);

        // Get wallet public key
        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        // Create RPC client
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create authority update transaction using SDK
        const transaction = await getUpdateAuthorityTransaction({
            rpc,
            payer: signer,
            mint: options.mint as Address,
            role: options.role,
            currentAuthority: signer,
            newAuthority: options.newAuthority as Address,
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            authorityRole: options.role.toString(),
            prevAuthority: signerAddress,
            newAuthority: options.newAuthority,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

export interface RemoveAuthorityOptions {
    mint: string;
    role: AuthorityRole;
    rpcUrl?: string;
}

export interface RemoveAuthorityResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    authorityRole?: string;
    removedAuthority?: string;
}

/**
 * Validates authority removal options
 * @param options - Authority removal configuration options
 * @throws Error if validation fails
 */
function validateRemoveAuthorityOptions(options: RemoveAuthorityOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }

    if (options.role === undefined || options.role === null) {
        throw new Error('Authority role is required');
    }

    if (options.mint.length < 32) {
        throw new Error('Invalid mint address format');
    }
}

/**
 * Removes (revokes) the authority for a given mint and role
 * This action is irreversible - the authority will be set to None
 * @param options - Configuration options for the authority removal
 * @param signer - Transaction sending signer instance (must be current authority)
 * @returns Promise that resolves to removal result with signature and details
 */
export const removeTokenAuthority = async (
    options: RemoveAuthorityOptions,
    signer: TransactionModifyingSigner,
): Promise<RemoveAuthorityResult> => {
    try {
        validateRemoveAuthorityOptions(options);

        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create authority removal transaction using SDK
        const transaction = await getRemoveAuthorityTransaction({
            rpc,
            payer: signer,
            mint: options.mint as Address,
            role: options.role,
            currentAuthority: signer,
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            authorityRole: options.role.toString(),
            removedAuthority: signerAddress,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
