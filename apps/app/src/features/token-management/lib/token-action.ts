import {
    createSolanaRpc,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    type TransactionModifyingSigner,
    type FullTransaction,
    type TransactionVersion,
    type TransactionMessageWithFeePayer,
    type TransactionWithBlockhashLifetime,
} from 'gill';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';

/**
 * Base options interface that all token action options must extend
 */
export interface BaseOptions {
    rpcUrl?: string;
}

/**
 * Base result interface that all token action results must extend
 */
export interface BaseResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
}

/**
 * Parameters passed to the buildTransaction function
 */
export interface BuildTransactionParams<TOptions extends BaseOptions> {
    rpc: Rpc<SolanaRpcApi>;
    signer: TransactionModifyingSigner;
    signerAddress: Address;
    options: TOptions;
}

/**
 * Configuration for executing a token action
 */
export interface TokenActionConfig<TOptions extends BaseOptions, TResult extends BaseResult> {
    options: TOptions;
    signer: TransactionModifyingSigner;
    validate: (options: TOptions) => void;
    buildTransaction: (params: BuildTransactionParams<TOptions>) => Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>>;
    buildSuccessResult: (signature: string, options: TOptions, signerAddress: Address) => Omit<TResult, 'success' | 'transactionSignature'>;
}

/**
 * Generic helper for executing token actions with common boilerplate:
 * - Validates options
 * - Checks wallet connection
 * - Creates RPC clients
 * - Builds, signs, and sends transaction
 * - Returns standardized success/error result
 *
 * @param config - Configuration for the token action
 * @returns Promise that resolves to the action result
 */
export async function executeTokenAction<TOptions extends BaseOptions, TResult extends BaseResult>(
    config: TokenActionConfig<TOptions, TResult>,
): Promise<TResult> {
    const { options, signer, validate, buildTransaction, buildSuccessResult } = config;

    try {
        // Validate options
        validate(options);

        // Check wallet connection
        const signerAddress = signer.address;
        if (!signerAddress) {
            throw new Error('Wallet not connected');
        }

        // Create RPC clients
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Build transaction
        const transaction = await buildTransaction({
            rpc,
            signer,
            signerAddress,
            options,
        });

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });

        const signature = getSignatureFromTransaction(signedTransaction);

        return {
            success: true,
            transactionSignature: signature,
            ...buildSuccessResult(signature, options, signerAddress),
        } as unknown as TResult;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        } as unknown as TResult;
    }
}
