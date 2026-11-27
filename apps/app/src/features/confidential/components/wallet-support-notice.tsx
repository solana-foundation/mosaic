'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfidentialKeys } from '../hooks/use-confidential-keys';

/**
 * Warns, before anything has been spent, that the connected wallet cannot sign
 * the key-derivation message.
 *
 * Every confidential step except approve, enable-credits and deposit needs
 * derived keys, so an incompatible wallet makes the feature unusable — but
 * `canDerive` otherwise only reaches the UI through the balance panel's Reveal
 * button, which renders solely on an already-configured account. Without this
 * notice a user discovers the incompatibility after creating a mint, minting,
 * and paying for a configure attempt.
 */
export function WalletSupportNotice() {
    const { canDerive } = useConfidentialKeys();

    if (canDerive) return null;

    return (
        <Alert variant="warning" className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
                <p className="text-xs">
                    The connected wallet does not expose message signing, which is required to derive the keys that
                    encrypt and decrypt confidential balances. Configure, apply, transfer, withdraw and empty will all
                    fail. Connect a wallet that can sign arbitrary messages before spending anything on this token.
                </p>
            </AlertDescription>
        </Alert>
    );
}
