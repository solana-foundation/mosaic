import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { mintTokens, type MintOptions } from '@/lib/management/mint';
import { TransactionModifyingSigner } from '@solana/signers';
import { X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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
            "sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden"
        )}>
            <div className="overflow-hidden">
                <AlertDialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
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

                <div className="p-6 space-y-5">
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
                        <>
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
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {mintAuthority}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-200 dark:border-red-800">
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <AlertDialogCancel className="w-full h-12 rounded-xl mt-0" disabled={isLoading}>
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
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            Minting...
                                        </>
                                    ) : (
                                        'Mint Tokens'
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </AlertDialogContent>
    );
}
