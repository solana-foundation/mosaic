import type { FullTransaction } from '../transaction-util';
import type {
    ConfidentialOperationPlan,
    ConfidentialOperationPlanStep,
    ConfidentialOperationPlanStepPhase,
} from './operation-plan';

export type ConfidentialOperationExecutionProgressStatus = 'signing' | 'sending' | 'confirmed' | 'failed';

export type ConfidentialOperationExecutionProgress = {
    index: number;
    total: number;
    label: string;
    phase: ConfidentialOperationPlanStepPhase;
    status: ConfidentialOperationExecutionProgressStatus;
    signature?: string;
    error?: string;
};

export type ConfidentialOperationExecutionStep = {
    step: ConfidentialOperationPlanStep;
    index: number;
    total: number;
};

export type ConfidentialOperationExecutionResult = {
    signatures: string[];
    cleanupError?: string;
};

export async function executeConfidentialOperationPlan<TSignedTransaction>(input: {
    plan: ConfidentialOperationPlan;
    prepareTransaction?: (
        transaction: FullTransaction,
        executionStep: ConfidentialOperationExecutionStep,
    ) => Promise<FullTransaction>;
    signTransaction: (
        transaction: FullTransaction,
        executionStep: ConfidentialOperationExecutionStep,
    ) => Promise<TSignedTransaction>;
    sendTransaction: (
        signedTransaction: TSignedTransaction,
        executionStep: ConfidentialOperationExecutionStep,
    ) => Promise<void>;
    getSignature?: (
        signedTransaction: TSignedTransaction,
        executionStep: ConfidentialOperationExecutionStep,
    ) => string | undefined;
    onProgress?: (progress: ConfidentialOperationExecutionProgress) => void;
}): Promise<ConfidentialOperationExecutionResult> {
    const signatures: string[] = [];
    const steps = input.plan.steps;
    const indexedSteps = steps.map((step, index) => ({ step, index, total: steps.length }));
    const cleanupSteps = indexedSteps.filter(({ step }) => step.phase === 'cleanup');

    const report = (
        executionStep: ConfidentialOperationExecutionStep,
        status: ConfidentialOperationExecutionProgressStatus,
        details: { signature?: string; error?: string } = {},
    ) => {
        input.onProgress?.({
            index: executionStep.index + 1,
            total: executionStep.total,
            label: executionStep.step.label,
            phase: executionStep.step.phase,
            status,
            ...details,
        });
    };

    const executeStep = async (executionStep: ConfidentialOperationExecutionStep): Promise<string | undefined> => {
        const transaction = input.prepareTransaction
            ? await input.prepareTransaction(executionStep.step.transaction, executionStep)
            : executionStep.step.transaction;

        report(executionStep, 'signing');
        const signedTransaction = await input.signTransaction(transaction, executionStep);
        report(executionStep, 'sending');
        await input.sendTransaction(signedTransaction, executionStep);

        const signature = input.getSignature?.(signedTransaction, executionStep);
        report(executionStep, 'confirmed', { signature });
        return signature;
    };

    const reportStepFailure = (executionStep: ConfidentialOperationExecutionStep, message: string) => {
        report(executionStep, 'failed', { error: message });
    };

    const runCleanupSteps = async (): Promise<string | undefined> => {
        const cleanupErrors: string[] = [];

        for (const cleanupStep of cleanupSteps) {
            try {
                const signature = await executeStep(cleanupStep);
                if (signature) signatures.push(signature);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                reportStepFailure(cleanupStep, message);
                cleanupErrors.push(`${cleanupStep.step.label}: ${message}`);
            }
        }

        return cleanupErrors.length > 0 ? cleanupErrors.join('; ') : undefined;
    };

    for (const executionStep of indexedSteps) {
        if (executionStep.step.phase === 'cleanup') {
            continue;
        }

        try {
            const signature = await executeStep(executionStep);
            if (signature) signatures.push(signature);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            reportStepFailure(executionStep, message);

            if (input.plan.cleanupPolicy === 'attempt-after-main') {
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
