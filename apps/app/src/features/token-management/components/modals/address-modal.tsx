'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { isAddress } from '@solana/kit';
import { cn } from '@/lib/utils';
import { MODAL_BUTTONS } from '@/features/token-management/constants/modal-text';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: () => void;
    newAddress: string;
    onAddressChange: (address: string) => void;
    title: string;
    placeholder: string;
    buttonText: string;
}

export function AddressModal({
    isOpen,
    onClose,
    onAdd,
    newAddress,
    onAddressChange,
    title,
    placeholder,
    buttonText,
}: AddressModalProps) {
    const inputId = useId();
    const errorId = useId();
    const isValidAddress = newAddress.trim() && isAddress(newAddress.trim());

    return (
        <AlertDialog
            open={isOpen}
            onOpenChange={open => {
                if (!open) onClose();
            }}
        >
            <AlertDialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-md overflow-hidden')}>
                <div className="overflow-hidden">
                    <AlertDialogHeader className="p-6 pb-4 border-b">
                        <div className="flex items-center justify-between">
                            <AlertDialogTitle className="text-xl font-semibold">{title}</AlertDialogTitle>
                            <AlertDialogCancel
                                className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </AlertDialogCancel>
                        </div>
                        <AlertDialogDescription>Enter a valid Solana wallet address</AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="p-6 space-y-4">
                        <div>
                            <label htmlFor={inputId} className="block text-sm font-medium mb-2">
                                Solana Address
                            </label>
                            <input
                                id={inputId}
                                type="text"
                                value={newAddress}
                                onChange={e => onAddressChange(e.target.value)}
                                placeholder={placeholder}
                                className={cn(
                                    'w-full p-3 border rounded-xl bg-background',
                                    newAddress.trim() && !isValidAddress ? 'border-red-500' : '',
                                )}
                                aria-invalid={newAddress.trim() && !isValidAddress ? true : undefined}
                                aria-describedby={newAddress.trim() && !isValidAddress ? errorId : undefined}
                                autoComplete="off"
                                autoFocus
                            />
                            {newAddress.trim() && !isValidAddress && (
                                <p id={errorId} className="text-red-500 text-sm mt-1" role="alert">
                                    Invalid Solana address
                                </p>
                            )}
                        </div>
                        <div className="flex space-x-2 pt-2">
                            <AlertDialogCancel className="flex-1 h-11 rounded-xl mt-0">
                                {MODAL_BUTTONS.CANCEL}
                            </AlertDialogCancel>
                            <Button onClick={onAdd} disabled={!isValidAddress} className="flex-1 h-11 rounded-xl">
                                {buttonText}
                            </Button>
                        </div>
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
