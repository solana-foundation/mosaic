'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { useConnector } from '@solana/connector/react';
import { getClusterName, buildExplorerUrl, getExplorerClusterParam } from '@/lib/solana/explorer';
import { CopyButton } from '@/components/ui/copy-button';
import { IconCircleDashed, IconSignature } from 'symbols-react';

interface TransactionSuccessViewProps {
    title: string;
    message: string;
    transactionSignature?: string;
    cluster?: string;
}

export function TransactionSuccessView({
    title,
    message,
    transactionSignature,
    cluster: clusterProp,
}: TransactionSuccessViewProps) {
    const { cluster: connectorCluster } = useConnector();

    // Use provided cluster prop, fall back to connector cluster, then to undefined
    const clusterName = clusterProp || getClusterName(connectorCluster);

    const handleExplorerClick = () => {
        if (!transactionSignature) return;
        const explorerUrl = buildExplorerUrl(transactionSignature, clusterName);
        window.open(explorerUrl, '_blank');
    };

    const handleHeliusClick = () => {
        if (!transactionSignature) return;
        // Helius orb uses different cluster format
        const clusterParam = getExplorerClusterParam(clusterName);
        const heliusCluster =
            clusterParam === 'devnet' ? '?cluster=devnet' : clusterParam === 'testnet' ? '?cluster=testnet' : '';
        const heliusUrl = `https://orb.helius.dev/tx/${transactionSignature}${heliusCluster}`;
        window.open(heliusUrl, '_blank');
    };

    return (
        <div className="space-y-6">
            {/* Success Icon and Message */}
            <div className="flex flex-col items-center text-center pt-2">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-[300px]">{message}</p>
            </div>

            {/* Transaction Signature */}
            {transactionSignature && (
                <div className="space-y-4">
                    {/* Centered label with lines */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 flex-col">
                            <div className="w-full h-px bg-border mb-1" />
                            <div className="w-full h-px bg-border mb-1" />
                            <div className="w-full h-px bg-border" />
                        </div>
                        <span className="text-xs font-medium text-primary flex items-center gap-2">
                            <IconSignature className="h-4 w-4 fill-muted-foreground" />
                            Transaction Signature
                        </span>
                        <div className="flex-1 flex-col">
                            <div className="w-full h-px bg-border mb-1" />
                            <div className="w-full h-px bg-border mb-1" />
                            <div className="w-full h-px bg-border" />
                        </div>
                    </div>

                    {/* Signature box */}
                    <div className="bg-muted/50 rounded-xl px-4 py-3">
                        <code className="block text-xs font-mono text-center truncate text-muted-foreground">
                            {transactionSignature}
                        </code>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        <CopyButton
                            textToCopy={transactionSignature}
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-lg h-9"
                            displayText="Copy"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExplorerClick}
                            className="flex-1 rounded-lg h-9"
                        >
                            Explorer
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleHeliusClick}
                            className="flex-1 rounded-lg h-9"
                        >
                            Orb
                            <IconCircleDashed className="h-3 w-3 fill-muted-foreground" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
