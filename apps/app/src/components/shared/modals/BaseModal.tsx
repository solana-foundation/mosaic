import { ReactNode } from 'react';

interface BaseModalProps {
    isOpen: boolean;
    children: ReactNode;
    className?: string;
}

export function BaseModal({ isOpen, children, className = '' }: BaseModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`bg-background p-6 rounded-lg w-full max-w-md mx-4 ${className}`}>{children}</div>
        </div>
    );
}
