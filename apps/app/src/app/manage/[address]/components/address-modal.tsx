'use client';

import { useId, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/shared/modals/base-modal';
import { isAddress } from 'gill';

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
    const titleId = useId();
    const inputId = useId();
    const errorId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const isValidAddress = newAddress.trim() && isAddress(newAddress.trim());

    // Focus the input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            // Small delay to ensure modal is fully rendered
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title={title} labelledBy={titleId}>
            <h3 id={titleId} className="text-lg font-semibold mb-4">
                {title}
            </h3>
            <div className="space-y-4">
                <div>
                    <label htmlFor={inputId} className="block text-sm font-medium mb-2">
                        Solana Address
                    </label>
                    <input
                        id={inputId}
                        ref={inputRef}
                        type="text"
                        value={newAddress}
                        onChange={e => onAddressChange(e.target.value)}
                        placeholder={placeholder}
                        className={`w-full p-2 border rounded-md ${
                            newAddress.trim() && !isValidAddress ? 'border-red-500' : ''
                        }`}
                        aria-invalid={newAddress.trim() && !isValidAddress ? true : undefined}
                        aria-describedby={newAddress.trim() && !isValidAddress ? errorId : undefined}
                        autoComplete="off"
                    />
                    {newAddress.trim() && !isValidAddress && (
                        <p id={errorId} className="text-red-500 text-sm mt-1" role="alert">
                            Invalid Solana address
                        </p>
                    )}
                </div>
                <div className="flex space-x-2">
                    <Button onClick={onAdd} disabled={!isValidAddress} className="flex-1">
                        {buttonText}
                    </Button>
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        Cancel
                    </Button>
                </div>
            </div>
        </BaseModal>
    );
}
