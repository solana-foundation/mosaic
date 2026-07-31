'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreationResultActionsProps {
    /** Mint of the freshly created token. Omit on the failure path. */
    mintAddress?: string;
    /** Dismisses the creation modal. */
    onClose?: () => void;
    closeLabel?: string;
}

/**
 * Footer of a token creation result screen: a link to the manage page for the new
 * mint plus an explicit dismiss action, so the success screen is never closed for
 * the user before they have read the mint address and signature.
 */
export function CreationResultActions({ mintAddress, onClose, closeLabel = 'Done' }: CreationResultActionsProps) {
    if (!mintAddress && !onClose) {
        return null;
    }

    return (
        <div className="pt-4 border-t flex flex-col gap-2">
            {mintAddress && (
                <Link href={`/manage/${mintAddress}`} onClick={onClose}>
                    <Button className="w-full">
                        <Settings className="h-4 w-4 mr-2" />
                        Manage Token
                    </Button>
                </Link>
            )}
            {onClose && (
                <Button type="button" variant="outline" className="w-full" onClick={onClose}>
                    {closeLabel}
                </Button>
            )}
        </div>
    );
}
