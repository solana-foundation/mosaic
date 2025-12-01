'use client';

import Link from 'next/link';
import { useConnector } from '@solana/connector/react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ActionResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    error?: string;
    transactionSignature?: string;
    actionInProgress: boolean;
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

/**
 * Gets the cluster name from various sources with fallback priority:
 * 1. Provided cluster name
 * 2. Connector cluster
 * 3. Environment variable NEXT_PUBLIC_SOLANA_NETWORK
 * 4. Default to 'mainnet-beta'
 */
function getEffectiveClusterName(clusterName?: string, connectorCluster?: unknown): string {
    if (clusterName) return clusterName;

    // Try to get from connector cluster
    const connectorClusterName = getClusterName(connectorCluster);
    if (connectorClusterName) return connectorClusterName;

    // Check environment variable as fallback
    const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    if (envNetwork) {
        // Sanitize and validate the env value
        const sanitized = envNetwork.trim().toLowerCase();
        if (['devnet', 'testnet', 'mainnet', 'mainnet-beta'].includes(sanitized)) {
            return sanitized === 'mainnet' ? 'mainnet-beta' : sanitized;
        }
    }

    // Default fallback to mainnet-beta
    return 'mainnet-beta';
}

/**
 * Builds a Solana Explorer URL for a transaction signature.
 * Omits the cluster query param for mainnet.
 * Validates and encodes the cluster parameter.
 */
function buildExplorerUrl(signature: string, clusterName?: string, connectorCluster?: unknown): string {
    const baseUrl = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
    const effectiveClusterName = getEffectiveClusterName(clusterName, connectorCluster);
    const clusterParam = getExplorerClusterParam(effectiveClusterName);

    if (clusterParam) {
        // Validate and encode the cluster parameter
        const encodedCluster = encodeURIComponent(clusterParam);
        return `${baseUrl}?cluster=${encodedCluster}`;
    }

    return baseUrl;
}

export function ActionResultModal({
    isOpen,
    onClose,
    error,
    transactionSignature,
    actionInProgress,
    cluster: clusterProp,
}: ActionResultModalProps) {
    const { cluster: connectorCluster } = useConnector();

    // Use provided cluster prop, fall back to connector cluster, then to default
    const clusterName = clusterProp || getClusterName(connectorCluster);

    const title = actionInProgress ? 'Action in progress...' : error ? 'Error' : 'Success';

    return (
        <AlertDialog
            open={isOpen}
            onOpenChange={open => {
                if (!open) onClose();
            }}
        >
            <AlertDialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden')}>
                <div className="overflow-hidden">
                    <AlertDialogHeader className="p-6 pb-4 border-b">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {actionInProgress ? (
                                    <Spinner size={20} className="text-amber-500" />
                                ) : error ? (
                                    <AlertCircle className="h-5 w-5 text-red-500" />
                                ) : (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                )}
                                <AlertDialogTitle className="text-xl font-semibold">{title}</AlertDialogTitle>
                            </div>
                            {!actionInProgress && (
                                <AlertDialogCancel
                                    className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </AlertDialogCancel>
                            )}
                        </div>
                        <AlertDialogDescription>
                            {actionInProgress
                                ? 'Please wait while the action completes'
                                : error
                                  ? 'An error occurred'
                                  : 'Operation completed successfully'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="p-6 space-y-5">
                        {/* Action in progress message */}
                        {actionInProgress && (
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-5 border border-amber-200 dark:border-amber-800">
                                <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                                    Action in progress. Please sign and submit the transaction to complete the action.
                                </p>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-5 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{error}</p>
                            </div>
                        )}

                        {/* Success Message */}
                        {!error && !actionInProgress && (
                            <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl p-5 border border-green-200 dark:border-green-800">
                                <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">
                                    Operation completed successfully!
                                </p>
                            </div>
                        )}

                        {/* Transaction Link */}
                        {transactionSignature && (
                            <div className="border-t pt-5">
                                <Link
                                    href={buildExplorerUrl(transactionSignature, clusterName, connectorCluster)}
                                    target="_blank"
                                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium text-sm"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                                    </svg>
                                    View transaction on Solana Explorer
                                </Link>
                            </div>
                        )}

                        {/* Close Button */}
                        {!actionInProgress && (
                            <div className="pt-2">
                                <AlertDialogCancel className="w-full h-12 rounded-xl mt-0">Close</AlertDialogCancel>
                            </div>
                        )}
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
