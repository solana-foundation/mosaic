import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { burnTokens, type BurnOptions } from '@/lib/management/burn';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, Flame, AlertTriangle } from 'lucide-react';
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
import { AmountInput } from '@/components/shared/form/amount-input';
import { useTransactionModal, useWalletConnection } from '@/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';
import { cn } from '@/lib/utils';

interface BurnModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onSuccess?: () => void;
}

export function BurnModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
    onSuccess,
}: BurnModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateAmount } = useInputValidation();
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

    const [amount, setAmount] = useState('');

    const handleBurn = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: BurnOptions = {
                mintAddress,
                amount,
                rpcUrl,
            };

            const result = await burnTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
                onSuccess?.();
            } else {
                setError(result.error || 'Burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setAmount('');
        reset();
    };

    useEffect(() => {
        return () => {
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
                            <Flame className="h-5 w-5 text-orange-500" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Burn Successful' : 'Burn Tokens'}
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
                        Permanently destroy {tokenSymbol || 'tokens'} from your wallet
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title="Tokens burned successfully!"
                            message={`${amount} ${tokenSymbol || 'tokens'} have been permanently destroyed`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Burn More"
                        />
                    ) : (
                        <>
                            <AmountInput
                                label="Amount to Burn"
                                value={amount}
                                onChange={setAmount}
                                placeholder="Enter amount to burn..."
                                helpText={`Number of ${tokenSymbol || 'tokens'} to permanently destroy`}
                                required
                                disabled={isLoading}
                            />

                            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-2xl p-5 space-y-3 border border-orange-200 dark:border-orange-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-900/50">
                                        <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <span className="font-semibold text-orange-700 dark:text-orange-300">
                                        Irreversible Action
                                    </span>
                                </div>
                                <p className="text-sm text-orange-700/80 dark:text-orange-300/80 leading-relaxed">
                                    Burning tokens permanently removes them from your wallet and reduces the total supply. 
                                    This action cannot be undone.
                                </p>
                            </div>

                            {walletAddress && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Burn From</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {walletAddress}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Tokens will be burned from your connected wallet
                                    </p>
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
                                    onClick={handleBurn}
                                    disabled={
                                        isLoading ||
                                        !amount.trim() ||
                                        !validateAmount(amount)
                                    }
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-orange-500 hover:bg-orange-600 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            Burning...
                                        </>
                                    ) : (
                                        <>
                                            <Flame className="h-4 w-4 mr-2" />
                                            Burn Tokens
                                        </>
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
