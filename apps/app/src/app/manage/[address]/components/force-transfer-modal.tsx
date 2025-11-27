import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { forceTransferTokens, type ForceTransferOptions } from '@/lib/management/force-transfer';
import { useConnector } from '@solana/connector/react';
import { isAddress } from 'gill';
import { TransactionModifyingSigner } from '@solana/signers';
import { ExternalLink, AlertCircle } from 'lucide-react';

interface ForceTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
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
 * 2. Environment variable NEXT_PUBLIC_SOLANA_NETWORK
 * 3. Default to 'devnet'
 */
function getEffectiveClusterName(clusterName?: string): string {
    if (clusterName) return clusterName;
    
    // Check environment variable as fallback
    const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    if (envNetwork) {
        // Sanitize and validate the env value
        const sanitized = envNetwork.trim().toLowerCase();
        if (['devnet', 'testnet', 'mainnet', 'mainnet-beta'].includes(sanitized)) {
            return sanitized === 'mainnet' ? 'mainnet-beta' : sanitized;
        }
    }
    
    // Default fallback
    return 'devnet';
}

/**
 * Builds a Solana Explorer URL for a transaction signature.
 * Omits the cluster query param for mainnet.
 * Defaults to devnet if cluster cannot be determined.
 */
function buildExplorerUrl(signature: string, clusterName?: string): string {
    const baseUrl = `https://explorer.solana.com/tx/${signature}`;
    const effectiveClusterName = getEffectiveClusterName(clusterName);
    const clusterParam = getExplorerClusterParam(effectiveClusterName);
    
    if (clusterParam) {
        return `${baseUrl}?cluster=${clusterParam}`;
    }
    
    return baseUrl;
}

export function ForceTransferModal({
    isOpen,
    onClose,
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceTransferModalProps) {
    const { selectedAccount, cluster } = useConnector();
    const [fromAddress, setFromAddress] = useState('');
    const [toAddress, setToAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [transactionSignature, setTransactionSignature] = useState('');

    if (!isOpen) return null;

    const validateSolanaAddress = (address: string) => {
        return isAddress(address);
    };

    const validateAmount = (amount: string) => {
        const num = parseFloat(amount);
        return !isNaN(num) && num > 0;
    };

    const handleForceTransfer = async () => {
        if (!selectedAccount) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(fromAddress)) {
            setError('Please enter a valid source Solana address');
            return;
        }

        if (!validateSolanaAddress(toAddress)) {
            setError('Please enter a valid destination Solana address');
            return;
        }

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const walletAddress = selectedAccount;

            const forceTransferOptions: ForceTransferOptions = {
                mintAddress,
                fromAddress,
                toAddress,
                amount,
                permanentDelegate: permanentDelegate || walletAddress,
                feePayer: walletAddress,
            };

            if (!transactionSendingSigner) {
                throw new Error('Transaction signer not available');
            }

            const result = await forceTransferTokens(forceTransferOptions, transactionSendingSigner);

            if (result.success) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature || '');
            } else {
                setError(result.error || 'Force transfer failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFromAddress('');
        setToAddress('');
        setAmount('');
        setError('');
        setSuccess(false);
        setTransactionSignature('');
        setIsLoading(false);
        onClose();
    };

    const handleAction = () => {
        if (success) {
            handleClose();
        } else {
            handleForceTransfer();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">
                    {success ? 'Force Transfer Successful' : 'Force Transfer Tokens'}
                </h3>

                {success ? (
                    <div className="space-y-4">
                        <div className="text-green-600">
                            <p className="font-medium">Tokens transferred successfully!</p>
                            <p className="text-sm mt-1">Amount: {amount} tokens</p>
                            <p className="text-sm">
                                From: {fromAddress.slice(0, 8)}...{fromAddress.slice(-6)}
                            </p>
                            <p className="text-sm">
                                To: {toAddress.slice(0, 8)}...{toAddress.slice(-6)}
                            </p>
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
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const clusterName = getClusterName(cluster);
                                            const explorerUrl = buildExplorerUrl(transactionSignature, clusterName);
                                            window.open(explorerUrl, '_blank');
                                        }}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex gap-2">
                                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-yellow-800">
                                    <p className="font-medium mb-1">Warning: Administrator Action</p>
                                    <p>
                                        This will force transfer tokens from any account without the owner&apos;s
                                        permission. Use with caution.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Source Address</label>
                            <input
                                type="text"
                                value={fromAddress}
                                onChange={e => setFromAddress(e.target.value)}
                                placeholder="Enter source wallet address..."
                                className="w-full p-2 border rounded-md"
                            />
                            {fromAddress && !validateSolanaAddress(fromAddress) && (
                                <p className="text-sm text-red-600 mt-1">Please enter a valid Solana address</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Destination Address</label>
                            <input
                                type="text"
                                value={toAddress}
                                onChange={e => setToAddress(e.target.value)}
                                placeholder="Enter destination wallet address..."
                                className="w-full p-2 border rounded-md"
                            />
                            {toAddress && !validateSolanaAddress(toAddress) && (
                                <p className="text-sm text-red-600 mt-1">Please enter a valid Solana address</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Amount</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="Enter amount to transfer..."
                                step="0.000000001"
                                min="0"
                                className="w-full p-2 border rounded-md"
                            />
                            {amount && !validateAmount(amount) && (
                                <p className="text-sm text-red-600 mt-1">Please enter a valid positive amount</p>
                            )}
                        </div>

                        {permanentDelegate && (
                            <div>
                                <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                                <input
                                    type="text"
                                    value={permanentDelegate}
                                    readOnly
                                    className="w-full p-2 border rounded-md bg-gray-50 text-sm"
                                />
                            </div>
                        )}

                        {error && <div className="text-red-600 text-sm">{error}</div>}
                    </div>
                )}

                <div className="flex space-x-2 mt-6">
                    {!success && (
                        <Button
                            onClick={handleAction}
                            disabled={
                                isLoading ||
                                (success
                                    ? false
                                    : !fromAddress.trim() ||
                                      !toAddress.trim() ||
                                      !amount.trim() ||
                                      !validateSolanaAddress(fromAddress) ||
                                      !validateSolanaAddress(toAddress) ||
                                      !validateAmount(amount))
                            }
                            className="flex-1"
                            variant={success ? 'default' : 'destructive'}
                        >
                            {isLoading ? 'Processing...' : 'Force Transfer'}
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleClose} className="flex-1">
                        {success ? 'Close' : 'Cancel'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
