'use client';

import { cn } from '@/lib/utils';

export interface Step {
    id: string;
    label: string;
}

interface FormStepperProps {
    steps: Step[];
    currentStep: number;
}

export function FormStepper({ steps, currentStep }: FormStepperProps) {
    return (
        <div className="w-full mb-6">
            {/* Current step label */}
            <p className="text-center text-sm text-muted-foreground mb-3">
                {steps[currentStep]?.label}
            </p>
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep;
                    const isCurrent = index === currentStep;

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                'h-1.5 rounded-full transition-all duration-300',
                                isCurrent
                                    ? 'w-8 bg-primary/50'
                                    : isCompleted
                                      ? 'w-3 bg-primary/40'
                                      : 'w-3 bg-muted-foreground/20',
                            )}
                        />
                    );
                })}
            </div>
        </div>
    );
}
