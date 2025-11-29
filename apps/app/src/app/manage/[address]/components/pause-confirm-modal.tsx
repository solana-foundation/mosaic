'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

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
        <AlertDialogContent className={cn(
            "sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden"
        )}>
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
                            {isPaused 
                                ? 'Resume all token transfers'
                                : 'Temporarily halt all token transfers'
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="p-6 space-y-5">
                        {isAuthorityError ? (
                            // Authority error state - prominent display
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-5 space-y-3 border border-amber-200 dark:border-amber-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50">
                                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <span className="font-semibold text-amber-700 dark:text-amber-300">Authority Required</span>
                                </div>
                                <p className="text-sm text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                                    {error}
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-muted-foreground leading-relaxed">
                                    {isPaused ? (
                                        <>
                                            You are about to unpause <span className="font-medium text-foreground">{tokenName}</span>. 
                                            This will allow all token transfers to resume normally.
                                        </>
                                    ) : (
                                        <>
                                            You are about to pause <span className="font-medium text-foreground">{tokenName}</span>. 
                                            This will prevent all token transfers until the token is unpaused.
                                        </>
                                    )}
                                </p>

                                {!isPaused && (
                                    <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-5 space-y-3 border border-red-200 dark:border-red-800">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                                                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                            </div>
                                            <span className="font-semibold text-red-700 dark:text-red-300">Important: When paused</span>
                                        </div>
                                        <ul className="space-y-2 ml-1">
                                            {[
                                                'No token transfers allowed',
                                                "Token holders can't send or receive tokens",
                                                "Mint authority can't mint new tokens",
                                                "Freeze authority can't freeze or thaw tokens",
                                                'DeFi protocols may malfunction',
                                                'Only the pause authority can unpause',
                                            ].map((item, index) => (
                                                <li key={index} className="flex items-start gap-2.5 text-red-700/80 dark:text-red-300/80 text-sm">
                                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400 flex-shrink-0" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {error && !isAuthorityError && (
                                    <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-200 dark:border-red-800">
                                        {error}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <AlertDialogCancel 
                                disabled={isLoading || isConfirming} 
                                className="w-full h-12 rounded-xl mt-0"
                            >
                                Cancel
                            </AlertDialogCancel>
                            {!isAuthorityError && (
                                <AlertDialogAction
                                    onClick={handleConfirm}
                                    disabled={isLoading || isConfirming}
                                    className={cn(
                                        "w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all",
                                        !isPaused && 'bg-red-500 hover:bg-red-600'
                                    )}
                                >
                                    {isLoading || isConfirming ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {actionContinuous}...
                                        </>
                                    ) : (
                                        <>Confirm {action}</>
                                    )}
                                </AlertDialogAction>
                            )}
                            {isAuthorityError && (
                                <AlertDialogCancel
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-secondary text-secondary-foreground hover:bg-secondary/80 mt-0"
                                >
                                    Understood
                                </AlertDialogCancel>
                            )}
                        </div>
                    </div>
                </div>
            </AlertDialogContent>
    );
}
