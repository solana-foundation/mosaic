import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { mintTokens, type MintOptions } from '@/lib/management/mint';
import { useConnector } from '@solana/connector/react';
import { isAddress } from 'gill';
import { TransactionModifyingSigner } from '@solana/signers';
import { ExternalLink } from 'lucide-react';

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

interface MintModalProps {
    isOpen: boolean;
    onClose: () => void;
    mintAddress: string;
    mintAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function MintModal({ isOpen, onClose, mintAddress, mintAuthority, transactionSendingSigner }: MintModalProps) {
    const { selectedAccount, cluster } = useConnector();
    const [recipient, setRecipient] = useState('');
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

    const handleMint = async () => {
        if (!selectedAccount) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(recipient)) {
            setError('Please enter a valid Solana address');
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

            const mintOptions: MintOptions = {
                mintAddress,
                recipient,
                amount,
                mintAuthority: mintAuthority || walletAddress,
                feePayer: walletAddress,
            };

            if (!transactionSendingSigner) {
                throw new Error('Transaction signer not available');
            }

            const result = await mintTokens(mintOptions, transactionSendingSigner);

            if (result.success) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature || '');
            } else {
                setError(result.error || 'Minting failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setRecipient('');
        setAmount('');
        setError('');
        setSuccess(false);
        setTransactionSignature('');
        setIsLoading(false);
        onClose();
    };

    const handleAdd = () => {
        if (success) {
            handleClose();
        } else {
            handleMint();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">{success ? 'Mint Successful' : 'Mint Tokens'}</h3>

                {success ? (
                    <div className="space-y-4">
                        <div className="text-green-600">
                            <p className="font-medium">Tokens minted successfully!</p>
                            <p className="text-sm mt-1">
                                Amount: {amount} tokens to {recipient}
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
                                        className="flex-1 p-2 border rounded-md bg-muted text-muted-foreground"
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const clusterName = getClusterName(cluster) || 'mainnet-beta';
                                            const isMainnet = clusterName === 'mainnet' || clusterName === 'mainnet-beta';
                                            const explorerUrl = isMainnet
                                                ? `https://explorer.solana.com/tx/${transactionSignature}`
                                                : `https://explorer.solana.com/tx/${transactionSignature}?cluster=${clusterName}`;
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
                        <div>
                            <label className="block text-sm font-medium mb-2">Recipient Address</label>
                            <input
                                type="text"
                                value={recipient}
                                onChange={e => setRecipient(e.target.value)}
                                placeholder="Enter recipient Solana address..."
                                className="w-full p-2 border rounded-md"
                            />
                            {recipient && !validateSolanaAddress(recipient) && (
                                <p className="text-sm text-red-600 mt-1">Please enter a valid Solana address</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Amount</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="Enter amount to mint..."
                                step="0.000000001"
                                min="0"
                                className="w-full p-2 border rounded-md"
                            />
                            {amount && !validateAmount(amount) && (
                                <p className="text-sm text-red-600 mt-1">Please enter a valid positive amount</p>
                            )}
                        </div>

                        {mintAuthority && (
                            <div>
                                <label className="block text-sm font-medium mb-2">Mint Authority</label>
                                <input
                                    type="text"
                                    value={mintAuthority}
                                    readOnly
                                    className="w-full p-2 border rounded-md bg-gray-50"
                                />
                            </div>
                        )}

                        {error && <div className="text-red-600 text-sm">{error}</div>}
                    </div>
                )}

                <div className="flex space-x-2 mt-6">
                    {!success && (
                        <Button
                            onClick={handleAdd}
                            disabled={
                                isLoading ||
                                (success
                                    ? false
                                    : !recipient.trim() ||
                                      !amount.trim() ||
                                      !validateSolanaAddress(recipient) ||
                                      !validateAmount(amount))
                            }
                            className="flex-1"
                        >
                            {isLoading ? 'Minting...' : 'Mint Tokens'}
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
