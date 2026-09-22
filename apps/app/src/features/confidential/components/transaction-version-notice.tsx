'use client';

import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfidentialTxVersion } from '../hooks/use-confidential-tx-version';

/**
 * Explains that confidential operations will take more transactions — and more
 * wallet prompts — than they need to, because the wallet or the RPC cannot
 * handle SIMD-0385 version-1 transactions.
 *
 * Informational rather than `variant="warning"`, unlike its sibling
 * `WalletSupportNotice`. That one is amber because a wallet without
 * message signing makes confidential transfers *unusable*; this is the app's
 * default path and works completely, just less efficiently. Colouring it as a
 * warning would train users to ignore the alert that actually means something is
 * broken.
 */
export function TransactionVersionNotice() {
    const { version, isProbing, rpcSupportsV1 } = useConfidentialTxVersion();

    // Say nothing until the RPC has been probed, and nothing at all once
    // version 1 is in use — there is no news in "everything is optimal".
    if (isProbing || version === 1) return null;

    // Reaching here means version 0, so exactly one of the two ends came back
    // negative: if the RPC is fine, the wallet is what is holding it back.
    const blocker = rpcSupportsV1
        ? 'the connected wallet does not advertise support for signing them'
        : 'the selected RPC endpoint does not accept them (they need Agave 4.2.2 or newer)';

    return (
        <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
                <p className="text-xs">
                    Confidential operations are being sent as version-0 transactions because {blocker}. Everything below
                    works — proof setup just gets split across more transactions, so expect more wallet signature
                    prompts per step than a version-1 path would need.
                </p>
            </AlertDescription>
        </Alert>
    );
}
