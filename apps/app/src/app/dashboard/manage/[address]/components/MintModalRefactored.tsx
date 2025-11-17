import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { mintTokens, type MintOptions } from '@/lib/management/mint';
import { TransactionModifyingSigner } from '@solana/signers';
import { Coins } from 'lucide-react';

import { BaseModal } from '@/components/shared/modals/BaseModal';
import { TransactionSuccessView } from '@/components/shared/modals/TransactionSuccessView';
import { SolanaAddressInput } from '@/components/shared/form/SolanaAddressInput';
import { AmountInput } from '@/components/shared/form/AmountInput';
import { useTransactionModal, useWalletConnection } from '@/hooks/useTransactionModal';
import { useInputValidation } from '@/hooks/useInputValidation';

interface MintModalProps {
    isOpen: boolean;
    onClose: () => void;
    mintAddress: string;
    mintAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function MintModalRefactored({
    isOpen,
    onClose,
    mintAddress,
    mintAuthority,
    transactionSendingSigner,
}: MintModalProps) {
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

    const handleClose = () => {
        setRecipient('');
        setAmount('');
        reset();
        onClose();
    };

    const handleContinue = () => {
        setRecipient('');
        setAmount('');
        reset();
    };

    return (
        <BaseModal isOpen={isOpen}>
            <div className="flex items-center gap-2 mb-4">
                <Coins className="h-5 w-5" />
                <h3 className="text-lg font-semibold">{success ? 'Mint Successful' : 'Mint Tokens'}</h3>
            </div>

            {success ? (
                <TransactionSuccessView
                    title="Tokens minted successfully!"
                    message={`${amount} tokens minted to ${recipient}`}
                    transactionSignature={transactionSignature}
                    onClose={handleClose}
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
                                className="w-full p-2 border rounded-md bg-gray-50"
                            />
                        </div>
                    )}

                    {error && <div className="text-red-600 text-sm">{error}</div>}

                    <div className="flex space-x-2 mt-6">
                        <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleMint}
                            disabled={
                                isLoading ||
                                !recipient.trim() ||
                                !amount.trim() ||
                                !validateSolanaAddress(recipient) ||
                                !validateAmount(amount)
                            }
                            className="flex-1"
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
        </BaseModal>
    );
}
