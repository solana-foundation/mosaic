import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { forceTransferTokens, type ForceTransferOptions } from '@/lib/management/force-transfer';
import { TransactionModifyingSigner } from '@solana/signers';
import { ArrowRightLeft, X } from 'lucide-react';
import { useConnector } from '@solana/connector/react';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { WarningBanner } from '@/components/shared/modals/warning-banner';
import { SolanaAddressInput } from '@/components/shared/form/solana-address-input';
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';
import { cn } from '@/lib/utils';

interface ForceTransferModalContentProps {
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function ForceTransferModalContent({
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceTransferModalContentProps) {
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

    const [fromAddress, setFromAddress] = useState('');
    const [toAddress, setToAddress] = useState('');
    const [amount, setAmount] = useState('');

    const handleForceTransfer = async () => {
        if (!walletAddress) {
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

        if (fromAddress === toAddress) {
            setError('Source and destination addresses must be different');
            return;
        }

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        if (parseFloat(amount) <= 0) {
            setError('Please enter an amount greater than zero');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const forceTransferOptions: ForceTransferOptions = {
                mintAddress,
                fromAddress,
                toAddress,
                amount,
                permanentDelegate: permanentDelegate || walletAddress,
                feePayer: walletAddress,
            };

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

    const resetForm = () => {
        setFromAddress('');
        setToAddress('');
        setAmount('');
        reset();
    };

    // Reset form when component unmounts (dialog closes)
    useEffect(() => {
        return () => {
            setFromAddress('');
            setToAddress('');
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
                            <ArrowRightLeft className="h-5 w-5" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Force Transfer Successful' : 'Force Transfer Tokens'}
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
                        Transfer tokens from any account without owner permission
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6">
                    {success ? (
                        <TransactionSuccessView
                            title="Tokens transferred successfully!"
                            message={`${amount} tokens transferred from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)} to ${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Transfer More"
                        />
                    ) : (
                            <div className="space-y-4">
                                <WarningBanner
                                    title="Warning: Administrator Action"
                                    message="This will force transfer tokens from any account without the owner's permission. Use with caution."
                                    variant="danger"
                                />

                                <SolanaAddressInput
                                    label="Source Address"
                                    value={fromAddress}
                                    onChange={setFromAddress}
                                    placeholder="Enter source wallet address..."
                                    helpText="The account from which tokens will be transferred"
                                    required
                                    disabled={isLoading}
                                />

                                <SolanaAddressInput
                                    label="Destination Address"
                                    value={toAddress}
                                    onChange={setToAddress}
                                    placeholder="Enter destination wallet address..."
                                    helpText="The account to which tokens will be transferred"
                                    required
                                    disabled={isLoading}
                                />

                                <AmountInput
                                    label="Amount"
                                    value={amount}
                                    onChange={setAmount}
                                    placeholder="Enter amount to transfer..."
                                    helpText="Number of tokens to transfer"
                                    required
                                    disabled={isLoading}
                                />

                                {permanentDelegate && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                                        <input
                                            type="text"
                                            value={permanentDelegate}
                                            readOnly
                                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-900 text-sm"
                                        />
                                    </div>
                                )}

                                {error && <div className="text-red-600 text-sm">{error}</div>}

                                <div className="flex space-x-2 pt-2">
                                    <AlertDialogCancel className="flex-1 h-11 rounded-xl mt-0" disabled={isLoading}>
                                        Cancel
                                    </AlertDialogCancel>
                                    <Button
                                        onClick={handleForceTransfer}
                                        disabled={
                                            isLoading ||
                                            !fromAddress.trim() ||
                                            !toAddress.trim() ||
                                            !amount.trim() ||
                                            !validateSolanaAddress(fromAddress) ||
                                            !validateSolanaAddress(toAddress) ||
                                            !validateAmount(amount)
                                        }
                                        className="flex-1 h-11 rounded-xl"
                                        variant="destructive"
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="animate-spin mr-2">⏳</span>
                                                Processing...
                                            </>
                                        ) : (
                                            'Force Transfer'
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
