import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { freezeTokenAccount, type FreezeAccountOptions } from '@/lib/management/freeze';
import { thawTokenAccount, type ThawAccountOptions } from '@/lib/management/thaw';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, Snowflake, Sun } from 'lucide-react';
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
import { useTransactionModal, useWalletConnection } from '@/hooks/use-transaction-modal';
import { useInputValidation } from '@/hooks/use-input-validation';
import { cn } from '@/lib/utils';

interface FreezeThawModalContentProps {
    mintAddress: string;
    freezeAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    mode: 'freeze' | 'thaw';
}

export function FreezeThawModalContent({
    mintAddress,
    freezeAuthority,
    transactionSendingSigner,
    mode,
}: FreezeThawModalContentProps) {
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

    const [tokenAccount, setTokenAccount] = useState('');

    const isFreeze = mode === 'freeze';
    const title = isFreeze ? 'Freeze Account' : 'Thaw Account';
    const successTitle = isFreeze ? 'Account Frozen' : 'Account Thawed';
    const actionLabel = isFreeze ? 'Freeze' : 'Thaw';
    const Icon = isFreeze ? Snowflake : Sun;

    const handleAction = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!validateSolanaAddress(tokenAccount)) {
            setError('Please enter a valid token account address');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: FreezeAccountOptions | ThawAccountOptions = {
                tokenAccount,
                rpcUrl,
            };

            const result = isFreeze
                ? await freezeTokenAccount(options, transactionSendingSigner)
                : await thawTokenAccount(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || `${actionLabel} failed`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setTokenAccount('');
        reset();
    };

    useEffect(() => {
        return () => {
            setTokenAccount('');
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
                            <Icon className={cn(
                                "h-5 w-5",
                                isFreeze ? "text-blue-500" : "text-amber-500"
                            )} />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? successTitle : title}
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
                        {isFreeze
                            ? 'Freeze a token account to prevent transfers'
                            : 'Thaw a frozen token account to allow transfers'}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title={`Account ${isFreeze ? 'frozen' : 'thawed'} successfully!`}
                            message={`Token account ${tokenAccount.slice(0, 8)}...${tokenAccount.slice(-6)} has been ${isFreeze ? 'frozen' : 'thawed'}`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel={`${actionLabel} Another`}
                        />
                    ) : (
                        <>
                            <SolanaAddressInput
                                label="Token Account Address"
                                value={tokenAccount}
                                onChange={setTokenAccount}
                                placeholder="Enter token account address..."
                                helpText="The associated token account to freeze or thaw"
                                required
                                disabled={isLoading}
                            />

                            <div className={cn(
                                "rounded-2xl p-5 space-y-3 border",
                                isFreeze 
                                    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-xl",
                                        isFreeze 
                                            ? "bg-blue-100 dark:bg-blue-900/50"
                                            : "bg-amber-100 dark:bg-amber-900/50"
                                    )}>
                                        <Icon className={cn(
                                            "h-5 w-5",
                                            isFreeze 
                                                ? "text-blue-600 dark:text-blue-400"
                                                : "text-amber-600 dark:text-amber-400"
                                        )} />
                                    </div>
                                    <span className={cn(
                                        "font-semibold",
                                        isFreeze 
                                            ? "text-blue-700 dark:text-blue-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}>
                                        {isFreeze ? 'Account Freeze' : 'Account Thaw'}
                                    </span>
                                </div>
                                <p className={cn(
                                    "text-sm leading-relaxed",
                                    isFreeze 
                                        ? "text-blue-700/80 dark:text-blue-300/80"
                                        : "text-amber-700/80 dark:text-amber-300/80"
                                )}>
                                    {isFreeze
                                        ? 'Freezing an account will prevent the owner from transferring tokens. This is different from pausing, which affects all accounts.'
                                        : 'Thawing an account will restore the ability for the owner to transfer tokens. Only the freeze authority can perform this action.'}
                                </p>
                            </div>

                            {freezeAuthority && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Freeze Authority</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {freezeAuthority}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Only the freeze authority can freeze or thaw accounts
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
                                    onClick={handleAction}
                                    disabled={
                                        isLoading ||
                                        !tokenAccount.trim() ||
                                        !validateSolanaAddress(tokenAccount)
                                    }
                                    className={cn(
                                        "w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all text-white",
                                        isFreeze 
                                            ? "bg-blue-500 hover:bg-blue-600"
                                            : "bg-amber-500 hover:bg-amber-600"
                                    )}
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            {isFreeze ? 'Freezing...' : 'Thawing...'}
                                        </>
                                    ) : (
                                        <>
                                            <Icon className="h-4 w-4 mr-2" />
                                            {actionLabel} Account
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
