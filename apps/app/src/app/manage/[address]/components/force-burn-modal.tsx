import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { forceBurnTokens, type ForceBurnOptions } from '@/lib/management/force-burn';
import { useConnector } from '@solana/connector/react';
import { isAddress } from 'gill';
import { TransactionModifyingSigner } from '@solana/signers';
import { ExternalLink, AlertCircle, Flame } from 'lucide-react';

interface ForceBurnModalProps {
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
 * Builds a Solana Explorer URL for a transaction signature.
 * Omits the cluster query param for mainnet.
 * Defaults to devnet if cluster cannot be determined.
 */
function buildExplorerUrl(signature: string, clusterName?: string): string {
    const baseUrl = `https://explorer.solana.com/tx/${signature}`;
    const clusterParam = getExplorerClusterParam(clusterName);
    
    if (clusterParam) {
        return `${baseUrl}?cluster=${clusterParam}`;
    }
    
    return baseUrl;
}

export function ForceBurnModal({
    isOpen,
    onClose,
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceBurnModalProps) {
    const { cluster } = useConnector();
    const [fromAddress, setFromAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [transactionSignature, setTransactionSignature] = useState('');
    const [burnedAmount, setBurnedAmount] = useState('');

    if (!isOpen) return null;

    const validateSolanaAddress = (address: string) => {
        return isAddress(address);
    };

    const validateAmount = (value: string) => {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);
        setTransactionSignature('');

        // Validate inputs
        if (!fromAddress || !validateSolanaAddress(fromAddress)) {
            setError('Please enter a valid source address');
            return;
        }

        if (!amount || !validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        setIsLoading(true);

        try {
            const options: ForceBurnOptions = {
                mintAddress,
                fromAddress,
                amount,
                permanentDelegate,
                rpcUrl: cluster?.url,
            };

            const result = await forceBurnTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                // Capture burned amount before clearing form
                setBurnedAmount(amount);
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
                // Reset form
                setFromAddress('');
                setAmount('');
            } else {
                setError(result.error || 'Force burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFromAddress('');
        setAmount('');
        setError('');
        setSuccess(false);
        setTransactionSignature('');
        setBurnedAmount('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Flame className="h-5 w-5 text-red-500" />
                        <h2 className="text-xl font-semibold">Force Burn Tokens</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        ✕
                    </button>
                </div>

                {/* Warning Banner */}
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                        <div className="text-sm text-red-800 dark:text-red-200">
                            <p className="font-semibold mb-1">Warning: Irreversible Action</p>
                            <p>
                                Force burning will permanently destroy tokens from any account. This action cannot be
                                undone. Only use this for compliance or emergency purposes.
                            </p>
                        </div>
                    </div>
                </div>

                {success ? (
                    <div className="text-center py-4">
                        <div className="text-green-600 dark:text-green-400 mb-4">
                            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Tokens Burned Successfully!</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {burnedAmount} tokens have been permanently burned from the specified account.
                        </p>
                        {transactionSignature && (
                            <div className="mb-4">
                                <a
                                    href={buildExplorerUrl(transactionSignature, getClusterName(cluster))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                                >
                                    View on Solana Explorer
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}
                        <div className="flex gap-3 justify-center">
                            <Button
                                onClick={() => {
                                    setSuccess(false);
                                    setTransactionSignature('');
                                    setBurnedAmount('');
                                    setFromAddress('');
                                    setAmount('');
                                }}
                                variant="outline"
                            >
                                Burn More
                            </Button>
                            <Button onClick={handleClose}>Close</Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Burn From Address</label>
                                <input
                                    type="text"
                                    value={fromAddress}
                                    onChange={e => setFromAddress(e.target.value)}
                                    placeholder="Enter wallet or token account address"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    The account from which tokens will be burned
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Amount to Burn</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Number of tokens to permanently destroy
                                </p>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClose}
                                    disabled={isLoading}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isLoading || !fromAddress || !amount}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <span className="animate-spin mr-2">⏳</span>
                                            Burning...
                                        </>
                                    ) : (
                                        <>
                                            <Flame className="h-4 w-4 mr-2" />
                                            Force Burn
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </form>
                )}

                {/* Additional Info */}
                {!success && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            <strong>Note:</strong> Only the permanent delegate authority can execute force burns. Ensure
                            you have the necessary permissions before attempting this action.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
