'use client';

import { Trash2 } from 'lucide-react';
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogAction,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface DeleteTokenModalContentProps {
    tokenName?: string;
    onConfirm: () => void;
}

export function DeleteTokenModalContent({ tokenName, onConfirm }: DeleteTokenModalContentProps) {
    return (
        <AlertDialogContent className="rounded-[24px] p-4.5">
            <AlertDialogHeader>
                <div className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-destructive" />
                    <AlertDialogTitle className="text-2xl font-bold">Delete Token from Storage</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-md">
                    Are you sure you want to remove {tokenName ? <span className="font-medium">{tokenName}</span> : 'this token'} from your local list?
                </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Warning box styled like card */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4">
                <p className="text-sm text-red-900 dark:text-red-200">
                    <span className="font-semibold">Warning:</span> This action only removes the token from your local browser storage. The token will still exist on the blockchain, but you will need to import it again to manage it.
                </p>
            </div>

            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                <AlertDialogAction
                    onClick={onConfirm}
                    className="w-full bg-destructive text-white hover:bg-destructive/90 rounded-xl font-semibold h-11"
                >
                    Delete Token
                </AlertDialogAction>
                <AlertDialogCancel className="w-full rounded-xl font-semibold h-11 mt-0">
                    Cancel
                </AlertDialogCancel>
            </AlertDialogFooter>
        </AlertDialogContent>
    );
}
