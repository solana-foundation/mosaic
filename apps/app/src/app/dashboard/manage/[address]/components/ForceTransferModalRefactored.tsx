import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { forceTransferTokens, type ForceTransferOptions } from '@/lib/management/force-transfer';
import { TransactionSendingSigner } from '@solana/signers';
import { ArrowRightLeft } from 'lucide-react';

import { BaseModal } from '@/components/shared/modals/BaseModal';
import { TransactionSuccessView } from '@/components/shared/modals/TransactionSuccessView';
import { WarningBanner } from '@/components/shared/modals/WarningBanner';
import { SolanaAddressInput } from '@/components/shared/form/SolanaAddressInput';
import { AmountInput } from '@/components/shared/form/AmountInput';
import { useTransactionModal, useWalletConnection } from '@/hooks/useTransactionModal';
import { useInputValidation } from '@/hooks/useInputValidation';

interface ForceTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionSendingSigner<string>;
}

export function ForceTransferModalRefactored({
    isOpen,
    onClose,
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceTransferModalProps) {
    const { walletAddress } = useWalletConnection();
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

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
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

    const handleClose = () => {
        setFromAddress('');
        setToAddress('');
        setAmount('');
        reset();
        onClose();
    };

    const handleContinue = () => {
        setFromAddress('');
        setToAddress('');
        setAmount('');
        reset();
    };

    return (
        <BaseModal isOpen={isOpen}>
            <div className="flex items-center gap-2 mb-4">
                <ArrowRightLeft className="h-5 w-5" />
                <h3 className="text-lg font-semibold">
                    {success ? 'Force Transfer Successful' : 'Force Transfer Tokens'}
                </h3>
            </div>

            {success ? (
                <TransactionSuccessView
                    title="Tokens transferred successfully!"
                    message={`${amount} tokens transferred from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)} to ${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`}
                    transactionSignature={transactionSignature}
                    onClose={handleClose}
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
                                className="w-full p-2 border rounded-md bg-gray-50 text-sm"
                            />
                        </div>
                    )}

                    {error && <div className="text-red-600 text-sm">{error}</div>}

                    <div className="flex space-x-2 mt-6">
                        <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isLoading}>
                            Cancel
                        </Button>
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
                            className="flex-1"
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
        </BaseModal>
    );
}
