'use client';

import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

interface TransactionSuccessViewProps {
    title: string;
    message: string;
    transactionSignature?: string;
    onClose: () => void;
    onContinue?: () => void;
    continueLabel?: string;
    cluster?: string;
}

/**
 * Maps internal cluster names to Solana Explorer cluster query parameter values.
 * Returns undefined for mainnet to omit the cluster param.
 */
function getExplorerClusterParam(clusterName?: string): string | undefined {
    if (!clusterName) return undefined;

    // Map internal cluster names to explorer values
    const clusterMap: Record<string, string | undefined> = {
        'mainnet-beta': undefined, // Omit cluster param for mainnet
        mainnet: undefined,
        devnet: 'devnet',
        testnet: 'testnet',
    };

    return clusterMap[clusterName.toLowerCase()] ?? clusterName.toLowerCase();
}

/**
 * Builds a Solana Explorer URL for a transaction signature.
 * Omits the cluster query param for mainnet.
 */
function buildExplorerUrl(signature: string, clusterName?: string): string {
    const baseUrl = `https://explorer.solana.com/tx/${signature}`;
    const clusterParam = getExplorerClusterParam(clusterName);

    if (clusterParam) {
        return `${baseUrl}?cluster=${clusterParam}`;
    }

    return baseUrl;
}

/**
 * Safely extracts cluster name from cluster object.
 * Handles different cluster object structures from @solana/connector.
 */
function getClusterName(cluster: unknown): string | undefined {
    if (!cluster || typeof cluster !== 'object') return undefined;

    // Try to access name property (may not be in type definition but exists at runtime)
    const clusterObj = cluster as Record<string, unknown>;
    if (typeof clusterObj.name === 'string') {
        return clusterObj.name;
    }

    // Fallback: try to infer from id (e.g., 'solana:mainnet' -> 'mainnet')
    if (typeof clusterObj.id === 'string') {
        const idParts = clusterObj.id.split(':');
        if (idParts.length > 1) {
            const network = idParts[1];
            // Map 'mainnet' to 'mainnet-beta' for consistency
            return network === 'mainnet' ? 'mainnet-beta' : network;
        }
    }

    // Fallback: try to infer from URL
    if (typeof clusterObj.url === 'string') {
        const url = clusterObj.url.toLowerCase();
        if (url.includes('mainnet') || url.includes('api.mainnet')) {
            return 'mainnet-beta';
        }
        if (url.includes('devnet') || url.includes('api.devnet')) {
            return 'devnet';
        }
        if (url.includes('testnet') || url.includes('api.testnet')) {
            return 'testnet';
        }
    }

    return undefined;
}

export function TransactionSuccessView({
    title,
    message,
    transactionSignature,
    onClose,
    onContinue,
    continueLabel = 'Continue',
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

    return (
        <div className="space-y-4">
            <div className="text-green-600">
                <CheckCircle className="h-12 w-12 mx-auto mb-3" />
                <p className="font-medium text-center">{title}</p>
                <p className="text-sm mt-1 text-center text-muted-foreground">{message}</p>
            </div>

            {transactionSignature && (
                <div>
                    <label className="block text-sm font-medium mb-2">Transaction Signature</label>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={transactionSignature}
                            readOnly
                            className="flex-1 p-2 border rounded-md bg-muted text-muted-foreground text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={handleExplorerClick}>
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex space-x-2 mt-6">
                {onContinue && (
                    <Button onClick={onContinue} variant="outline" className="flex-1">
                        {continueLabel}
                    </Button>
                )}
                <Button onClick={onClose} className="flex-1">
                    Close
                </Button>
            </div>
        </div>
    );
}
