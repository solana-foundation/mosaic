import { ComponentPropsWithoutRef } from 'react';

interface CornerIconProps extends ComponentPropsWithoutRef<'svg'> {
    className?: string;
}

export function CornerIcon({ className, ...rest }: CornerIconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className={className}
            {...rest}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 -12v48M-12 12h48" />
        </svg>
    );
}
