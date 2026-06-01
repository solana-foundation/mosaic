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
    type TransactionVersion,
    type TransactionMessageWithFeePayer,
    type TransactionMessageWithBlockhashLifetime,
    assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';
import {
    refreshTransactionBlockhash,
    type ConfidentialOperationPlan,
    type ConfidentialOperationPlanStep,
    type ConfidentialOperationPlanStepPhase,
} from '@solana/mosaic-sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';
import type { FullTransaction } from '@/lib/solana/types';

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
    buildTransaction: (
        params: BuildTransactionParams<TOptions>,
    ) => Promise<
        FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionMessageWithBlockhashLifetime>
    >;
    buildSuccessResult: (
        signature: string,
        options: TOptions,
        signerAddress: Address,
    ) => Omit<TResult, 'success' | 'transactionSignature'>;
}

export type MultiTransactionStep = ConfidentialOperationPlanStep;

export interface MultiTransactionProgress {
    index: number;
    total: number;
    label: string;
    phase: ConfidentialOperationPlanStepPhase;
    status: 'signing' | 'sending' | 'confirmed' | 'failed';
    signature?: string;
    error?: string;
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
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
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

export async function executeMultiTransactionAction(input: {
    plan: ConfidentialOperationPlan;
    rpcUrl?: string;
    onProgress?: (progress: MultiTransactionProgress) => void;
}): Promise<{ signatures: string[]; cleanupError?: string }> {
    const rpcUrl = getRpcUrl(input.rpcUrl);
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
    const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    const signatures: string[] = [];
    const steps = input.plan.steps;
    const indexedSteps = steps.map((step, index) => ({ step, index }));
    const cleanupSteps = indexedSteps.filter(({ step }) => step.phase === 'cleanup');

    const reportStepFailure = (indexedStep: (typeof indexedSteps)[number], message: string) => {
        input.onProgress?.({
            index: indexedStep.index + 1,
            total: steps.length,
            label: indexedStep.step.label,
            phase: indexedStep.step.phase,
            status: 'failed',
            error: message,
        });
    };

    const executeStep = async ({ step, index }: (typeof indexedSteps)[number]): Promise<string> => {
        const progressBase = {
            index: index + 1,
            total: steps.length,
            label: step.label,
            phase: step.phase,
        };

        const transaction = await refreshTransactionBlockhash(rpc, step.transaction);
        input.onProgress?.({ ...progressBase, status: 'signing' });
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        input.onProgress?.({ ...progressBase, status: 'sending' });
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransaction(signedTransaction, {
            commitment: getCommitment(),
        });
        const signature = getSignatureFromTransaction(signedTransaction);
        input.onProgress?.({ ...progressBase, status: 'confirmed', signature });
        return signature;
    };

    const runCleanupSteps = async (): Promise<string | undefined> => {
        for (const cleanupStep of cleanupSteps) {
            try {
                signatures.push(await executeStep(cleanupStep));
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error occurred';
                reportStepFailure(cleanupStep, message);
                return message;
            }
        }
        return undefined;
    };

    for (const indexedStep of indexedSteps) {
        if (indexedStep.step.phase === 'cleanup') {
            continue;
        }

        try {
            signatures.push(await executeStep(indexedStep));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            reportStepFailure(indexedStep, message);
            if (indexedStep.step.phase === 'main' && input.plan.cleanupPolicy === 'attempt-after-main') {
                const cleanupError = await runCleanupSteps();
                if (cleanupError) {
                    throw new Error(`${message}. Cleanup failed: ${cleanupError}`);
                }
            }
            throw error;
        }
    }

    if (input.plan.cleanupPolicy === 'attempt-after-main') {
        const cleanupError = await runCleanupSteps();
        if (cleanupError) {
            return { signatures, cleanupError };
        }
    }

    return { signatures };
}
