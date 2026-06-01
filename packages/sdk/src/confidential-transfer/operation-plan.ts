import type { FullTransaction } from '../transaction-util';
import type {
    ConfidentialTransferFeeWithdrawPlan,
    ConfidentialTransferPlan,
    ConfidentialTransferWithFeePlan,
} from './types';

export type ConfidentialOperationPlanStepPhase = 'setup' | 'main' | 'cleanup';

export type ConfidentialOperationPlanCleanupPolicy = 'none' | 'attempt-after-main';

export type ConfidentialOperationPlanStep = {
    label: string;
    phase: ConfidentialOperationPlanStepPhase;
    transaction: FullTransaction;
};

export type ConfidentialOperationPlan = {
    steps: ConfidentialOperationPlanStep[];
    cleanupPolicy: ConfidentialOperationPlanCleanupPolicy;
};

export function createConfidentialOperationPlan(input: {
    steps: ConfidentialOperationPlanStep[];
    cleanupPolicy?: ConfidentialOperationPlanCleanupPolicy;
}): ConfidentialOperationPlan {
    if (input.steps.length === 0) {
        throw new Error('Confidential operation plan must include at least one transaction step');
    }

    const steps = input.steps.map(step => ({
        ...step,
        label: step.label.trim(),
    }));

    if (steps.some(step => !step.label)) {
        throw new Error('Confidential operation plan steps must include labels');
    }

    if (!steps.some(step => step.phase === 'main')) {
        throw new Error('Confidential operation plan must include a main transaction step');
    }

    const hasCleanup = steps.some(step => step.phase === 'cleanup');
    const cleanupPolicy = input.cleanupPolicy ?? (hasCleanup ? 'attempt-after-main' : 'none');

    if (cleanupPolicy === 'attempt-after-main' && !hasCleanup) {
        throw new Error('Confidential operation plan cleanup policy requires a cleanup step');
    }

    if (cleanupPolicy === 'none' && hasCleanup) {
        throw new Error('Confidential operation plan cleanup steps require a cleanup policy');
    }

    return {
        steps,
        cleanupPolicy,
    };
}

export function createSingleTransactionConfidentialOperationPlan(input: {
    label: string;
    transaction: FullTransaction;
}): ConfidentialOperationPlan {
    return createConfidentialOperationPlan({
        cleanupPolicy: 'none',
        steps: [
            {
                label: input.label,
                phase: 'main',
                transaction: input.transaction,
            },
        ],
    });
}

export function createConfidentialTransferOperationPlan(
    plan: ConfidentialTransferPlan | ConfidentialTransferWithFeePlan,
): ConfidentialOperationPlan {
    return createConfidentialOperationPlan({
        cleanupPolicy: 'attempt-after-main',
        steps: [
            ...plan.setupTransactions.map((transaction, index) => ({
                label: `Proof setup ${index + 1}`,
                phase: 'setup' as const,
                transaction,
            })),
            {
                label: 'feeAmount' in plan ? 'Private transfer with fee' : 'Private transfer',
                phase: 'main' as const,
                transaction: plan.transferTransaction,
            },
            {
                label: 'Proof cleanup',
                phase: 'cleanup' as const,
                transaction: plan.cleanupTransaction,
            },
        ],
    });
}

export function createConfidentialFeeWithdrawOperationPlan(
    plan: ConfidentialTransferFeeWithdrawPlan,
): ConfidentialOperationPlan {
    return createConfidentialOperationPlan({
        cleanupPolicy: 'attempt-after-main',
        steps: [
            ...plan.setupTransactions.map((transaction, index) => ({
                label: `Proof setup ${index + 1}`,
                phase: 'setup' as const,
                transaction,
            })),
            {
                label: 'Withdraw fees',
                phase: 'main' as const,
                transaction: plan.withdrawTransaction,
            },
            {
                label: 'Proof cleanup',
                phase: 'cleanup' as const,
                transaction: plan.cleanupTransaction,
            },
        ],
    });
}
