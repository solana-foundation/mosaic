import { useState, useCallback } from 'react';

interface UseMultiStepFormOptions {
    totalSteps: number;
    initialStep?: number;
}

interface UseMultiStepFormReturn {
    currentStep: number;
    direction: number;
    isFirstStep: boolean;
    isLastStep: boolean;
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (step: number) => void;
    reset: () => void;
}

export function useMultiStepForm({ totalSteps, initialStep = 0 }: UseMultiStepFormOptions): UseMultiStepFormReturn {
    const [[currentStep, direction], setStepState] = useState<[number, number]>([initialStep, 0]);

    const nextStep = useCallback(() => {
        setStepState(([current]) => {
            if (current < totalSteps - 1) {
                return [current + 1, 1];
            }
            return [current, 0];
        });
    }, [totalSteps]);

    const prevStep = useCallback(() => {
        setStepState(([current]) => {
            if (current > 0) {
                return [current - 1, -1];
            }
            return [current, 0];
        });
    }, []);

    const goToStep = useCallback(
        (step: number) => {
            setStepState(([current]) => {
                if (step >= 0 && step < totalSteps) {
                    return [step, step > current ? 1 : -1];
                }
                return [current, 0];
            });
        },
        [totalSteps],
    );

    const reset = useCallback(() => {
        setStepState([initialStep, 0]);
    }, [initialStep]);

    return {
        currentStep,
        direction,
        isFirstStep: currentStep === 0,
        isLastStep: currentStep === totalSteps - 1,
        nextStep,
        prevStep,
        goToStep,
        reset,
    };
}
