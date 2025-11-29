import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { mintTokens, type MintOptions } from '@/lib/management/mint';
import { TransactionModifyingSigner } from '@solana/signers';
import { Coins, X } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';
import { cn } from '@/lib/utils';

interface MintModalContentProps {
    mintAddress: string;
    mintAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function MintModalContent({
    mintAddress,
    mintAuthority,
    transactionSendingSigner,
}: MintModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateSolanaAddress, validateAmount } = useInputValidation();
    const {
        isLoading,
        error,
        success,
        transactionSignature,
        setIsLoading,
        setError,
        setSuccess,
        setTransactionSignature,
        reset,
    } = useTransactionModal();

    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');

    const handleMint = async () => {
        if (!walletAddress) {
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
            const mintOptions: MintOptions = {
                mintAddress,
                recipient,
                amount,
                mintAuthority: mintAuthority || walletAddress,
                feePayer: walletAddress,
            };

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

    const resetForm = () => {
        setRecipient('');
        setAmount('');
        reset();
    };

    // Reset form when component unmounts (dialog closes)
    useEffect(() => {
        return () => {
            setRecipient('');
            setAmount('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleContinue = () => {
        resetForm();
    };

    return (
        <AlertDialogContent className={cn(
            "sm:rounded-3xl p-0 gap-0 max-w-md overflow-hidden"
        )}>
            <div className="max-h-[90vh] overflow-y-auto">
                <AlertDialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Coins className="h-5 w-5" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Mint Successful' : 'Mint Tokens'}
                            </AlertDialogTitle>
                        </div>
                        <AlertDialogCancel
                            className="rounded-full p-1.5 hover:bg-muted transition-colors border-0 h-auto w-auto mt-0"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </AlertDialogCancel>
                    </div>
                    <AlertDialogDescription>
                        Create new tokens and send them to any address
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6">
                    {success ? (
                        <TransactionSuccessView
                            title="Tokens minted successfully!"
                            message={`${amount} tokens minted to ${recipient}`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Mint More"
                        />
                    ) : (
                            <div className="space-y-4">
                                <SolanaAddressInput
                                    label="Recipient Address"
                                    value={recipient}
                                    onChange={setRecipient}
                                    placeholder="Enter recipient Solana address..."
                                    required
                                    disabled={isLoading}
                                />

                                <AmountInput
                                    label="Amount"
                                    value={amount}
                                    onChange={setAmount}
                                    placeholder="Enter amount to mint..."
                                    helpText="Number of tokens to mint"
                                    required
                                    disabled={isLoading}
                                />

                                {mintAuthority && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Mint Authority</label>
                                        <input
                                            type="text"
                                            value={mintAuthority}
                                            readOnly
                                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-900"
                                        />
                                    </div>
                                )}

                                {error && <div className="text-red-600 text-sm">{error}</div>}

                                <div className="flex space-x-2 pt-2">
                                    <AlertDialogCancel className="flex-1 h-11 rounded-xl mt-0" disabled={isLoading}>
                                        Cancel
                                    </AlertDialogCancel>
                                    <Button
                                        onClick={handleMint}
                                        disabled={
                                            isLoading ||
                                            !recipient.trim() ||
                                            !amount.trim() ||
                                            !validateSolanaAddress(recipient) ||
                                            !validateAmount(amount)
                                        }
                                        className="flex-1 h-11 rounded-xl"
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="animate-spin mr-2">⏳</span>
                                                Minting...
                                            </>
                                        ) : (
                                            'Mint Tokens'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </AlertDialogContent>
    );
}
