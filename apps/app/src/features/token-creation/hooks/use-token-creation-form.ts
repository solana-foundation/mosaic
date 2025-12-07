import { useState, useCallback } from 'react';
import type { TransactionModifyingSigner } from '@solana/kit';
import { createTokenDisplayFromResult } from '@/features/token-creation/lib/token-storage';
import { useTokenStore } from '@/stores/token-store';
import { useMultiStepForm } from './use-multi-step-form';

interface BaseTokenOptions {
    name: string;
    symbol: string;
    decimals: string;
}

interface BaseCreationResult {
    success: boolean;
    mintAddress?: string;
    transactionSignature?: string;
    error?: string;
}

type TemplateId = 'arcade-token' | 'tokenized-security' | 'stablecoin' | 'custom-token';

interface UseTokenCreationFormConfig<TOptions extends BaseTokenOptions, TResult extends BaseCreationResult> {
    initialOptions: TOptions;
    createToken: (
        options: TOptions & { rpcUrl?: string },
        signer: TransactionModifyingSigner<string>,
    ) => Promise<TResult>;
    templateId: TemplateId;
    totalSteps?: number;
    canProceed?: (step: number, options: TOptions) => boolean;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
}

interface UseTokenCreationFormReturn<TOptions, TResult> {
    options: TOptions;
    setOption: (field: string, value: string | boolean) => void;
    currentStep: number;
    direction: number;
    isFirstStep: boolean;
    isLastStep: boolean;
    goToNextStep: () => void;
    goToPrevStep: () => void;
    isCreating: boolean;
    result: TResult | null;
    handleSubmit: () => Promise<void>;
    canProceedFromStep: (step: number) => boolean;
}

export function useTokenCreationForm<TOptions extends BaseTokenOptions, TResult extends BaseCreationResult>({
    initialOptions,
    createToken,
    templateId,
    totalSteps = 3,
    canProceed,
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
}: UseTokenCreationFormConfig<TOptions, TResult>): UseTokenCreationFormReturn<TOptions, TResult> {
    const addToken = useTokenStore(state => state.addToken);
    const { currentStep, direction, isFirstStep, isLastStep, nextStep, prevStep } = useMultiStepForm({
        totalSteps,
    });

    const [options, setOptions] = useState<TOptions>(initialOptions);
    const [isCreating, setIsCreating] = useState(false);
    const [result, setResult] = useState<TResult | null>(null);

    const setOption = useCallback((field: string, value: string | boolean) => {
        setOptions(prev => ({ ...prev, [field]: value }));
    }, []);

    const defaultCanProceed = useCallback(
        (step: number): boolean => {
            if (step === 0) {
                return !!(options.name && options.symbol && options.decimals);
            }
            return true;
        },
        [options.name, options.symbol, options.decimals],
    );

    const canProceedFromStep = useCallback(
        (step: number): boolean => {
            if (canProceed) {
                return canProceed(step, options);
            }
            return defaultCanProceed(step);
        },
        [canProceed, options, defaultCanProceed],
    );

    const goToNextStep = useCallback(() => {
        if (canProceedFromStep(currentStep)) {
            nextStep();
        }
    }, [canProceedFromStep, currentStep, nextStep]);

    const goToPrevStep = useCallback(() => {
        prevStep();
    }, [prevStep]);

    const handleSubmit = useCallback(async () => {
        setIsCreating(true);
        setResult(null);

        try {
            const creationResult = await createToken({ ...options, rpcUrl }, transactionSendingSigner);

            if (creationResult.success && creationResult.mintAddress) {
                // Extract wallet address from signer
                const addrValue: unknown = (
                    transactionSendingSigner as {
                        address?: unknown;
                    }
                ).address;
                const defaultAuthority =
                    typeof addrValue === 'string'
                        ? addrValue
                        : typeof addrValue === 'object' && addrValue !== null && 'toString' in addrValue
                          ? String((addrValue as { toString: () => string }).toString())
                          : '';

                // Create token display and save to store
                const tokenDisplay = await createTokenDisplayFromResult(
                    creationResult,
                    templateId,
                    options,
                    defaultAuthority,
                );

                addToken(tokenDisplay);
                onTokenCreated?.();
            }

            setResult(creationResult);
        } catch (error) {
            setResult({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            } as TResult);
        } finally {
            setIsCreating(false);
        }
    }, [options, rpcUrl, transactionSendingSigner, createToken, templateId, addToken, onTokenCreated]);

    return {
        options,
        setOption,
        currentStep,
        direction,
        isFirstStep,
        isLastStep,
        goToNextStep,
        goToPrevStep,
        isCreating,
        result,
        handleSubmit,
        canProceedFromStep,
    };
}
