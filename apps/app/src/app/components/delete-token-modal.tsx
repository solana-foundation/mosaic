'use client';

import { AlertTriangle, X } from 'lucide-react';
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogAction,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface DeleteTokenModalContentProps {
    tokenName?: string;
    onConfirm: () => void;
}

export function DeleteTokenModalContent({ tokenName, onConfirm }: DeleteTokenModalContentProps) {
    return (
        <AlertDialogContent className={cn(
            "sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden"
        )}>
            <div className="overflow-hidden">
                <AlertDialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <AlertDialogTitle className="text-xl font-semibold">Delete Token from Storage</AlertDialogTitle>
                        <AlertDialogCancel
                            className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </AlertDialogCancel>
                    </div>
                    <AlertDialogDescription>
                        Remove token from your local browser storage
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    <p className="text-muted-foreground leading-relaxed">
                        You are about to remove {tokenName ? <span className="font-medium text-foreground">{tokenName}</span> : 'this token'} from your local list.
                    </p>

                    <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-5 space-y-3 border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                            <span className="font-semibold text-red-700 dark:text-red-300">Important</span>
                        </div>
                        <ul className="space-y-2 ml-1">
                            {[
                                'Token will be removed from your local browser storage',
                                'The token will continue to exist on the blockchain',
                                'You will need to import it again to manage it',
                                'This action cannot be undone locally',
                            ].map((item, index) => (
                                <li key={index} className="flex items-start gap-2.5 text-red-700/80 dark:text-red-300/80 text-sm">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400 flex-shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <AlertDialogCancel className="w-full h-12 rounded-xl mt-0">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onConfirm}
                            className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-red-500 hover:bg-red-600 text-white"
                        >
                            Delete Token
                        </AlertDialogAction>
                    </div>
                </div>
            </div>
        </AlertDialogContent>
    );
}
