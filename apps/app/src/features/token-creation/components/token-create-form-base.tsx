'use client';

import { ReactNode } from 'react';
import { FormStepper, Step } from './form-stepper';
import { StepContainer } from './step-container';
import { StepNavigation } from './step-navigation';

interface TokenCreateFormBaseProps<TOptions, TResult> {
    steps: Step[];
    submitLabel: string;
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
    renderStep: (step: number, options: TOptions, setOption: (field: string, value: string | boolean) => void) => ReactNode;
    renderResult: (result: TResult) => ReactNode;
    onCancel?: () => void;
}

export function TokenCreateFormBase<TOptions, TResult>({
    steps,
    submitLabel,
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
    renderStep,
    renderResult,
    onCancel,
}: TokenCreateFormBaseProps<TOptions, TResult>) {
    if (result) {
        return <>{renderResult(result)}</>;
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
                <FormStepper steps={steps} currentStep={currentStep} />
                <StepContainer>
                    {renderStep(currentStep, options, setOption)}
                </StepContainer>
            </div>
            {/* Sticky Navigation at Bottom */}
            <div className="shrink-0">
                <StepNavigation
                    isFirstStep={isFirstStep}
                    isLastStep={isLastStep}
                    onBack={goToPrevStep}
                    onNext={goToNextStep}
                    onSubmit={handleSubmit}
                    onCancel={onCancel}
                    isSubmitting={isCreating}
                    submitLabel={submitLabel}
                    nextDisabled={!canProceedFromStep(currentStep)}
                />
            </div>
        </div>
    );
}
