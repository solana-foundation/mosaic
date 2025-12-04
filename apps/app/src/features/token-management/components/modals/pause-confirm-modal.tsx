'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ModalWarning } from '@/components/shared/modals/modal-warning';
import { ModalError } from '@/components/shared/modals/modal-error';
import { cn } from '@/lib/utils';
import {
    MODAL_BUTTONS,
    MODAL_WARNINGS,
    MODAL_DESCRIPTIONS,
    PAUSE_EFFECTS,
} from '@/features/token-management/constants/modal-text';

interface PauseConfirmModalContentProps {
    onConfirm: () => Promise<void>;
    isPaused: boolean;
    tokenName: string;
    isLoading?: boolean;
    error?: string;
}

export function PauseConfirmModalContent({
    onConfirm,
    isPaused,
    tokenName,
    isLoading = false,
    error,
}: PauseConfirmModalContentProps) {
    const [isConfirming, setIsConfirming] = useState(false);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await onConfirm();
        } finally {
            setIsConfirming(false);
        }
    };

    const action = isPaused ? 'Unpause' : 'Pause';
    const actionContinuous = isPaused ? 'Unpausing' : 'Pausing';

    // Check if this is an authority error
    const isAuthorityError = error?.toLowerCase().includes('pause authority');

    return (
        <AlertDialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden')}>
            <div className="overflow-hidden">
                <AlertDialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <AlertDialogTitle className="text-xl font-semibold">{action} Token</AlertDialogTitle>
                        <AlertDialogCancel
                            className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </AlertDialogCancel>
                    </div>
                    <AlertDialogDescription>
                        {isPaused ? MODAL_DESCRIPTIONS.UNPAUSE : MODAL_DESCRIPTIONS.PAUSE}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {isAuthorityError ? (
                        <ModalWarning variant="amber" title={MODAL_WARNINGS.AUTHORITY_REQUIRED_TITLE} icon={AlertTriangle}>
                            {error}
                        </ModalWarning>
                    ) : (
                        <>
                            <p className="text-muted-foreground leading-relaxed">
                                {isPaused ? (
                                    <>
                                        You are about to unpause{' '}
                                        <span className="font-medium text-foreground">{tokenName}</span>. This will
                                        allow all token transfers to resume normally.
                                    </>
                                ) : (
                                    <>
                                        You are about to pause{' '}
                                        <span className="font-medium text-foreground">{tokenName}</span>. This will
                                        prevent all token transfers until the token is unpaused.
                                    </>
                                )}
                            </p>

                            {!isPaused && (
                                <ModalWarning variant="red" title={MODAL_WARNINGS.IMPORTANT_WHEN_PAUSED_TITLE} icon={AlertTriangle}>
                                    <ul className="space-y-2 ml-1">
                                        {PAUSE_EFFECTS.map((item, index) => (
                                            <li
                                                key={index}
                                                className="flex items-start gap-2.5 text-sm"
                                            >
                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400 flex-shrink-0" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </ModalWarning>
                            )}

                            {error && !isAuthorityError && <ModalError error={error} />}
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <AlertDialogCancel disabled={isLoading || isConfirming} className="w-full h-12 rounded-xl mt-0">
                            {MODAL_BUTTONS.CANCEL}
                        </AlertDialogCancel>
                        {!isAuthorityError && (
                            <AlertDialogAction
                                onClick={handleConfirm}
                                disabled={isLoading || isConfirming}
                                className={cn(
                                    'w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all',
                                    !isPaused && 'bg-red-500 hover:bg-red-600',
                                )}
                            >
                                {isLoading || isConfirming ? (
                                    <>
                                        <Spinner size={16} className="mr-2" />
                                        {actionContinuous}...
                                    </>
                                ) : (
                                    <>Confirm {action}</>
                                )}
                            </AlertDialogAction>
                        )}
                        {isAuthorityError && (
                            <AlertDialogCancel className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-secondary text-secondary-foreground hover:bg-secondary/80 mt-0">
                                {MODAL_BUTTONS.UNDERSTOOD}
                            </AlertDialogCancel>
                        )}
                    </div>
                </div>
            </div>
        </AlertDialogContent>
    );
}
