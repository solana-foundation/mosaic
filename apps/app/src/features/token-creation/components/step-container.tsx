'use client';

import { ReactNode } from 'react';

interface StepContainerProps {
    currentStep: number;
    direction: number;
    children: ReactNode;
}

export function StepContainer({ children }: StepContainerProps) {
    return <div>{children}</div>;
}
