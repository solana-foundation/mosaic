'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface StepNavigationProps {
    isFirstStep: boolean;
    isLastStep: boolean;
    onBack: () => void;
    onNext: () => void;
    onSubmit: () => void;
    onCancel?: () => void;
    isSubmitting?: boolean;
    submitLabel?: string;
    nextDisabled?: boolean;
}

export function StepNavigation({
    isFirstStep,
    isLastStep,
    onBack,
    onNext,
    onSubmit,
    onCancel,
    isSubmitting = false,
    submitLabel = 'Create Token',
    nextDisabled = false,
}: StepNavigationProps) {
    return (
        <div className="flex gap-4 pt-4">
            {isFirstStep && onCancel ? (
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-12" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
            ) : !isFirstStep ? (
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-12" onClick={onBack} disabled={isSubmitting}>
                    Back
                </Button>
            ) : null}
            {isLastStep ? (
                <Button type="button" onClick={onSubmit} disabled={isSubmitting || nextDisabled} variant="default" className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white h-12">
                    {isSubmitting ? (
                        <>
                            <Spinner className="w-4 h-4 mr-2" />
                            Creating...
                        </>
                    ) : (
                        submitLabel
                    )}
                </Button>
            ) : (
                <Button type="button" onClick={onNext} disabled={nextDisabled} variant="default" className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white h-12">
                    Continue
                </Button>
            )}
        </div>
    );
}
