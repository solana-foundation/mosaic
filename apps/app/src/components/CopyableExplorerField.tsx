import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface CopyableExplorerFieldProps {
    label: string;
    value?: string;
    kind: 'address' | 'tx';
    cluster?: 'devnet' | 'testnet' | 'mainnet-beta';
}

export function CopyableExplorerField({ label, value, kind, cluster = 'devnet' }: CopyableExplorerFieldProps) {
    const [copied, setCopied] = useState(false);
    const explorerPath = kind === 'address' ? 'address' : 'tx';

    const onCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div>
            <strong>{label}:</strong>
            <div className="mt-1 flex items-center gap-2 min-w-0">
                <div className="max-w-full overflow-x-auto inline-block align-middle">
                    <code
                        className="ml-2 bg-muted px-2 py-1 rounded text-sm whitespace-nowrap inline-block cursor-pointer hover:bg-muted/80"
                        title="Click to copy"
                        onClick={onCopy}
                    >
                        {value}
                    </code>
                </div>
                {copied && <span className="text-green-600 text-xs">Copied</span>}
                {value && (
                    <Button asChild variant="outline" size="sm" type="button">
                        <a
                            href={`https://explorer.solana.com/${explorerPath}/${value}?cluster=${cluster}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${label.toLowerCase()} in Solana Explorer (${cluster})`}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </Button>
                )}
            </div>
        </div>
    );
}
