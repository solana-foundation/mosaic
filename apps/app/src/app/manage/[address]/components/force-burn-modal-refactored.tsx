import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { forceBurnTokens, type ForceBurnOptions } from '@/lib/management/force-burn';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, AlertTriangle } from 'lucide-react';
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

interface ForceBurnModalContentProps {
    mintAddress: string;
    permanentDelegate?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function ForceBurnModalContent({
    mintAddress,
    permanentDelegate,
    transactionSendingSigner,
}: ForceBurnModalContentProps) {
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
    const [amount, setAmount] = useState('');

    const handleForceBurn = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(fromAddress)) {
            setError('Please enter a valid source address');
            return;
        }

        if (!validateAmount(amount)) {
            setError('Please enter a valid amount');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Get RPC URL from cluster, environment variable, or default to devnet
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: ForceBurnOptions = {
                mintAddress,
                fromAddress,
                amount,
                permanentDelegate: permanentDelegate || walletAddress,
                rpcUrl,
            };

            const result = await forceBurnTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Force burn failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFromAddress('');
        setAmount('');
        reset();
    };

    // Reset form when component unmounts (dialog closes)
    useEffect(() => {
        return () => {
            setFromAddress('');
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
                                {success ? 'Force Burn Successful' : 'Force Burn Tokens'}
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
                        Permanently destroy tokens from any account
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title="Tokens burned successfully!"
                            message={`${amount} tokens have been permanently burned from ${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)}`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Burn More"
                        />
                    ) : (
                        <>
                            <SolanaAddressInput
                                label="Burn From Address"
                                value={fromAddress}
                                onChange={setFromAddress}
                                placeholder="Enter wallet or token account address..."
                                helpText="The account from which tokens will be burned"
                                required
                                disabled={isLoading}
                            />

                            <AmountInput
                                label="Amount to Burn"
                                value={amount}
                                onChange={setAmount}
                                placeholder="Enter amount to burn..."
                                helpText="Number of tokens to permanently destroy"
                                required
                                disabled={isLoading}
                            />
                            
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-5 space-y-3 border border-red-200 dark:border-red-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                    </div>
                                    <span className="font-semibold text-red-700 dark:text-red-300">Irreversible Action</span>
                                </div>
                                <p className="text-sm text-red-700/80 dark:text-red-300/80 leading-relaxed">
                                    Force burning will permanently destroy tokens from any account. This action cannot be undone. Only use this for compliance or emergency purposes.
                                </p>
                            </div>
                            
                            {permanentDelegate && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {permanentDelegate}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Only the permanent delegate can execute force burns
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
                                    onClick={handleForceBurn}
                                    disabled={
                                        isLoading ||
                                        !fromAddress.trim() ||
                                        !amount.trim() ||
                                        !validateSolanaAddress(fromAddress) ||
                                        !validateAmount(amount)
                                    }
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-red-500 hover:bg-red-600 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            Burning...
                                        </>
                                    ) : (
                                        <>
                                            Force Burn
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
