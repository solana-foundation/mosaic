import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { updateTokenMetadata, type UpdateMetadataOptions } from '@/features/token-management/lib/metadata';
import { TransactionModifyingSigner } from '@solana/signers';
import { X, FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useConnector } from '@solana/connector/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { useTransactionModal, useWalletConnection } from '@/features/token-management/hooks/use-transaction-modal';
import { cn } from '@/lib/utils';

interface UpdateMetadataModalContentProps {
    mintAddress: string;
    currentName?: string;
    currentSymbol?: string;
    currentUri?: string;
    metadataAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
}

type MetadataField = 'name' | 'symbol' | 'uri';

const fieldLabels: Record<MetadataField, { label: string; placeholder: string; maxLength: number }> = {
    name: { label: 'Token Name', placeholder: 'Enter new token name...', maxLength: 32 },
    symbol: { label: 'Token Symbol', placeholder: 'Enter new symbol...', maxLength: 10 },
    uri: { label: 'Metadata URI', placeholder: 'Enter new metadata URI...', maxLength: 200 },
};

export function UpdateMetadataModalContent({
    mintAddress,
    currentName,
    currentSymbol,
    currentUri,
    metadataAuthority,
    transactionSendingSigner,
}: UpdateMetadataModalContentProps) {
    const { walletAddress } = useWalletConnection();
    const { cluster } = useConnector();
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

    const [field, setField] = useState<MetadataField>('name');
    const [value, setValue] = useState('');

    // Update value when field changes
    useEffect(() => {
        const newValue = field === 'name' ? (currentName || '') : field === 'symbol' ? (currentSymbol || '') : (currentUri || '');
        setValue(newValue);
    }, [field, currentName, currentSymbol, currentUri]);

    const handleUpdate = async () => {
        if (!walletAddress) {
            setError('Wallet not connected');
            return;
        }

        if (!value.trim()) {
            setError('Please enter a value');
            return;
        }

        if (value.length > fieldLabels[field].maxLength) {
            setError(`${fieldLabels[field].label} must be ${fieldLabels[field].maxLength} characters or less`);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            const options: UpdateMetadataOptions = {
                mintAddress,
                field,
                value: value.trim(),
                rpcUrl,
            };

            const result = await updateTokenMetadata(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
            } else {
                setError(result.error || 'Update failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setField('name');
        setValue(currentName || '');
        reset();
    };

    useEffect(() => {
        return () => {
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
                            <FileText className="h-5 w-5 text-primary" />
                            <AlertDialogTitle className="text-xl font-semibold">
                                {success ? 'Update Successful' : 'Update Metadata'}
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
                        Update your token&apos;s name, symbol, or metadata URI
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="p-6 space-y-5">
                    {success ? (
                        <TransactionSuccessView
                            title="Metadata updated successfully!"
                            message={`${fieldLabels[field].label} has been updated to "${value}"`}
                            transactionSignature={transactionSignature}
                            cluster={(cluster as { name?: string })?.name}
                            onClose={handleContinue}
                            onContinue={handleContinue}
                            continueLabel="Update More"
                        />
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>Field to Update</Label>
                                <Select value={field} onValueChange={v => setField(v as MetadataField)}>
                                    <SelectTrigger className="rounded-xl h-12">
                                        <SelectValue placeholder="Select field" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="name">Token Name</SelectItem>
                                        <SelectItem value="symbol">Token Symbol</SelectItem>
                                        <SelectItem value="uri">Metadata URI</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{fieldLabels[field].label}</Label>
                                <Input
                                    value={value}
                                    onChange={e => setValue(e.target.value)}
                                    placeholder={fieldLabels[field].placeholder}
                                    className="rounded-xl h-12"
                                    disabled={isLoading}
                                    maxLength={fieldLabels[field].maxLength}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {value.length}/{fieldLabels[field].maxLength} characters
                                </p>
                            </div>

                            {metadataAuthority && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Metadata Authority</label>
                                    <div className="w-full p-3 border rounded-xl bg-muted/50 text-sm font-mono truncate">
                                        {metadataAuthority}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        Only the metadata authority can update token metadata
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
                                    onClick={handleUpdate}
                                    disabled={isLoading || !value.trim() || value.length > fieldLabels[field].maxLength}
                                    className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner size={16} className="mr-2" />
                                            Updating...
                                        </>
                                    ) : (
                                        'Update Metadata'
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
