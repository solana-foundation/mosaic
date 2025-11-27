'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useConnector } from '@solana/connector/react';
import { useEffect, useRef, useId } from 'react';

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
        'mainnet': undefined,
        'devnet': 'devnet',
        'testnet': 'testnet',
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
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const titleId = useId();
    
    // Use provided cluster prop, fall back to connector cluster, then to default
    const clusterName = clusterProp || getClusterName(connectorCluster);
    
    // Store the previously focused element when modal opens
    useEffect(() => {
        if (isOpen) {
            previouslyFocusedElement.current = document.activeElement as HTMLElement;
            // Focus the modal when it opens
            setTimeout(() => {
                closeButtonRef.current?.focus();
            }, 0);
        } else {
            // Return focus to previously focused element when modal closes
            if (previouslyFocusedElement.current) {
                previouslyFocusedElement.current.focus();
                previouslyFocusedElement.current = null;
            }
        }
    }, [isOpen]);
    
    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;
        
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }
        
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);
    
    // Focus trap: keep focus within modal
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;
        
        const modal = modalRef.current;
        const focusableElements = modal.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        function handleTabKey(event: KeyboardEvent) {
            if (event.key !== 'Tab') return;
            
            if (event.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement) {
                    event.preventDefault();
                    lastElement?.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement) {
                    event.preventDefault();
                    firstElement?.focus();
                }
            }
        }
        
        modal.addEventListener('keydown', handleTabKey);
        return () => {
            modal.removeEventListener('keydown', handleTabKey);
        };
    }, [isOpen]);
    
    // Handle backdrop click
    function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }
    
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
            role="presentation"
        >
            <div 
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-background border rounded-lg w-full max-w-md mx-4 shadow-lg"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b">
                    <h3 id={titleId} className="text-lg font-semibold flex items-center gap-2">
                        {actionInProgress ? (
                            <span className="text-yellow-500">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-spin">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="31.416" strokeDashoffset="31.416" opacity="0.3" />
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="31.416" strokeDashoffset="23.562" transform="rotate(-90 12 12)" />
                                </svg>
                            </span>
                        ) : error ? (
                            <span className="text-red-500">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                                </svg>
                            </span>
                        ) : (
                            <span className="text-green-500">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                </svg>
                            </span>
                        )}
                        {actionInProgress ? 'Action in progress...' : error ? 'Error' : 'Success'}
                    </h3>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    {/* Action in progress message */}
                    {actionInProgress && (
                        <div className="text-sm">
                            <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3 leading-relaxed">
                                Action in progress. Please sign and submit the transaction to complete the action.
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="text-sm">
                            <p className="text-red-700 bg-red-50 border border-red-200 rounded-md p-3 leading-relaxed">
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Success Message */}
                    {!error && !actionInProgress && (
                        <div className="text-sm">
                            <p className="text-green-700 bg-green-50 border border-green-200 rounded-md p-3 leading-relaxed">
                                Operation completed successfully!
                            </p>
                        </div>
                    )}

                    {/* Transaction Link */}
                    {transactionSignature && (
                        <div className="border-t pt-4">
                            <Link
                                href={buildExplorerUrl(transactionSignature, clusterName, connectorCluster)}
                                target="_blank"
                                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors font-medium text-sm"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                                </svg>
                                View transaction on Solana Explorer
                            </Link>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/20">
                    <Button ref={closeButtonRef} onClick={onClose} className="w-full">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
