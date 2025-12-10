'use client';

import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { buildAddressExplorerUrl, buildExplorerUrl } from '@/lib/solana/explorer';

interface CopyableExplorerFieldProps {
    label: string;
    value?: string;
    kind: 'address' | 'tx';
    cluster?: 'devnet' | 'testnet' | 'mainnet-beta';
}

export function CopyableExplorerField({ label, value, kind, cluster }: CopyableExplorerFieldProps) {
    if (!value) {
        return (
            <div>
                <strong>{label}:</strong>
                <div className="mt-1 text-muted-foreground">No value</div>
            </div>
        );
    }

    const explorerUrl =
        kind === 'tx' ? buildExplorerUrl(value, cluster) : buildAddressExplorerUrl(value, { name: cluster });

    return (
        <div>
            <strong>{label}:</strong>
            <div className="mt-1 flex items-center gap-2 min-w-0">
                <div className="max-w-full overflow-x-auto inline-block align-middle">
                    <code className="ml-2 bg-muted px-2 py-1 rounded text-sm whitespace-nowrap inline-block">
                        {value}
                    </code>
                </div>
                <CopyButton
                    textToCopy={value}
                    iconOnly
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-6 w-6"
                    iconClassName="h-3 w-3"
                    iconClassNameCheck="h-3 w-3"
                />
                <Button asChild variant="outline" size="sm" type="button">
                    <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${label.toLowerCase()} in Solana Explorer`}
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </div>
        </div>
    );
}
