import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { transferTokens, type TransferTokensOptions } from '@/lib/management/transfer';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, Send } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

interface TransferModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function TransferModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
}: TransferModalContentProps) {
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
    const [memo, setMemo] = useState('');

    const handleTransfer = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(recipient)) {
            setError('Please enter a valid recipient address');
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

            const options: TransferTokensOptions = {
                mintAddress,
                recipient,
                amount,
                memo: memo.trim() || undefined,
                rpcUrl,
            };

            const result = await transferTokens(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Transfer failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setRecipient('');
        setAmount('');
        setMemo('');
        reset();
    };

    useEffect(() => {
        return () => {
            setRecipient('');
            setAmount('');
            setMemo('');
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
                            <Send className="h-5 w-5 text-primary" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Transfer Successful' : 'Transfer Tokens'}
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
                        Send {tokenSymbol || 'tokens'} from your wallet to another address
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title="Transfer successful!"
                            message={`${amount} ${tokenSymbol || 'tokens'} sent to ${recipient.slice(0, 8)}...${recipient.slice(-6)}`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Transfer More"
                        />
                    ) : (
                        <>
                            <SolanaAddressInput
                                label="Recipient Address"
                                value={recipient}
                                onChange={setRecipient}
                                placeholder="Enter recipient Solana address..."
                                helpText="The wallet that will receive the tokens"
                                required
                                disabled={isLoading}
                            />

                            <AmountInput
                                label="Amount"
                                value={amount}
                                onChange={setAmount}
                                placeholder="Enter amount to send..."
                                helpText={`Number of ${tokenSymbol || 'tokens'} to transfer`}
                                required
                                disabled={isLoading}
                            />

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Memo <span className="text-muted-foreground font-normal">(optional)</span>
                                </label>
                                <Input
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value)}
                                    placeholder="Add a memo to the transaction..."
                                    className="rounded-xl"
                                    disabled={isLoading}
                                    maxLength={280}
                                />
                                <p className="text-xs text-muted-foreground mt-1.5">
                                    Optional message attached to the transaction
                                </p>
                            </div>

                            {walletAddress && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">From</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {walletAddress}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Tokens will be sent from your connected wallet
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
                                    onClick={handleTransfer}
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
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Send Tokens
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
