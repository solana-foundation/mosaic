import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { closeTokenAccount, type CloseAccountOptions } from '@/features/token-management/lib/close-account';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, XCircle, AlertTriangle } from 'lucide-react';
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
import { useTransactionModal, useWalletConnection } from '@/features/token-management/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CloseAccountModalContentProps {
    mintAddress: string;
    tokenSymbol?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

export function CloseAccountModalContent({
    mintAddress,
    tokenSymbol,
    transactionSendingSigner,
}: CloseAccountModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
    const { validateSolanaAddress } = useInputValidation();
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

    const [useCustomDestination, setUseCustomDestination] = useState(false);
    const [destination, setDestination] = useState('');

    const handleCloseAccount = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (useCustomDestination && !validateSolanaAddress(destination)) {
            setError('Please enter a valid destination address');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: CloseAccountOptions = {
                mintAddress,
                destination: useCustomDestination ? destination : undefined,
                rpcUrl,
            };

            const result = await closeTokenAccount(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Close account failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setUseCustomDestination(false);
        setDestination('');
        reset();
    };

    useEffect(() => {
        return () => {
            setUseCustomDestination(false);
            setDestination('');
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleContinue = () => {
        resetForm();
    };

    return (
        <AlertDialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden')}>
            <div className="overflow-hidden">
                <AlertDialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <XCircle className="h-5 w-5 text-red-500" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Account Closed' : 'Close Token Account'}
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
                        Close your {tokenSymbol || 'token'} account and reclaim the rent
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title="Account closed successfully!"
                            message="Your token account has been closed and the rent has been reclaimed"
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                        />
                    ) : (
                        <>
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-5 space-y-3 border border-amber-200 dark:border-amber-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50">
                                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                                        Requirements
                                    </span>
                                </div>
                                <ul className="text-sm text-amber-700/80 dark:text-amber-300/80 leading-relaxed list-disc pl-5 space-y-1">
                                    <li>
                                        Your token account must have a <strong>zero balance</strong>
                                    </li>
                                    <li>Closing the account will reclaim ~0.002 SOL in rent</li>
                                    <li>This action cannot be undone</li>
                                </ul>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
                                <div className="space-y-0.5">
                                    <Label htmlFor="custom-dest">Custom Destination</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Send reclaimed rent to a different address
                                    </p>
                                </div>
                                <Switch
                                    id="custom-dest"
                                    checked={useCustomDestination}
                                    onCheckedChange={setUseCustomDestination}
                                    disabled={isLoading}
                                />
                            </div>

                            {useCustomDestination && (
                                <SolanaAddressInput
                                    label="Destination Address"
                                    value={destination}
                                    onChange={setDestination}
                                    placeholder="Enter destination address for rent..."
                                    helpText="The address that will receive the reclaimed SOL"
                                    required
                                    disabled={isLoading}
                                />
                            )}

                            {!useCustomDestination && walletAddress && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Rent Destination</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {walletAddress}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Reclaimed SOL will be sent to your connected wallet
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
                                    onClick={handleCloseAccount}
                                    disabled={
                                        isLoading || (useCustomDestination && !validateSolanaAddress(destination))
                                    }
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-red-500 hover:bg-red-600 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            Closing...
                                        </>
                                    ) : (
                                        <>
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Close Account
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
