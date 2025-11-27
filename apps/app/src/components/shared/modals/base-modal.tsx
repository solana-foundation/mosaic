'use client';

import { ReactNode, useId } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

interface BaseModalProps {
    isOpen: boolean;
    onClose?: () => void;
    children: ReactNode;
    className?: string;
    title?: string;
    labelledBy?: string;
}

export function BaseModal({
    isOpen,
    onClose,
    children,
    className = '',
    title,
    labelledBy,
}: BaseModalProps) {
    const titleId = useId();
    const labelId = labelledBy || (title ? titleId : undefined);

    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={labelId}
                    className={cn(
                        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg mx-4',
                        className,
                    )}
                    onEscapeKeyDown={(e) => {
                        if (!onClose) {
                            e.preventDefault();
                        }
                    }}
                    onPointerDownOutside={(e) => {
                        if (!onClose) {
                            e.preventDefault();
                        }
                    }}
                    onInteractOutside={(e) => {
                        if (!onClose) {
                            e.preventDefault();
                        }
                    }}
                >
                    {title && (
                        <DialogPrimitive.Title id={titleId} className="sr-only">
                            {title}
                        </DialogPrimitive.Title>
                    )}
                    {children}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
