import { useState, useEffect } from 'react';
import {
    updateTokenMetadataBatch,
    type UpdateMetadataBatchOptions,
    type MetadataUpdate,
} from '@/features/token-management/lib/metadata';
import { TransactionModifyingSigner } from '@solana/signers';
import { FileText } from 'lucide-react';
import { useConnector } from '@solana/connector/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ExtensionModal } from '@/components/shared/modals/extension-modal';
import { ModalError } from '@/components/shared/modals/modal-error';
import { ModalFooter } from '@/components/shared/modals/modal-footer';
import { TransactionSuccessView } from '@/components/shared/modals/transaction-success-view';
import { useTransactionModal, useWalletConnection } from '@/features/token-management/hooks/use-transaction-modal';
import { MODAL_ERRORS } from '@/features/token-management/constants/modal-text';
import { humanizeError } from '@/lib/errors';

interface UpdateMetadataModalContentProps {
    mintAddress: string;
    currentName?: string;
    currentSymbol?: string;
    currentUri?: string;
    metadataAuthority?: string;
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onSuccess?: (updates: { name?: string; symbol?: string; uri?: string }) => void;
}

interface StringInputConfig {
    label: string;
    placeholder: string;
    maxLength: number;
}

const FIELD_CONFIG: Record<'name' | 'symbol' | 'uri', StringInputConfig> = {
    name: { label: 'Token Name', placeholder: 'Enter token name...', maxLength: 32 },
    symbol: { label: 'Token Symbol', placeholder: 'Enter symbol...', maxLength: 10 },
    uri: { label: 'Metadata URI', placeholder: 'Enter metadata URI...', maxLength: 200 },
};

export function UpdateMetadataModalContent({
    mintAddress,
    currentName,
    currentSymbol,
    currentUri,
    metadataAuthority,
    transactionSendingSigner,
    onSuccess,
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

    const [name, setName] = useState(currentName || '');
    const [symbol, setSymbol] = useState(currentSymbol || '');
    const [uri, setUri] = useState(currentUri || '');
    const [updatedFields, setUpdatedFields] = useState<string[]>([]);

    // Check which fields have been modified
    const hasNameChanged = name.trim() !== (currentName || '');
    const hasSymbolChanged = symbol.trim() !== (currentSymbol || '');
    const hasUriChanged = uri.trim() !== (currentUri || '');
    const hasChanges = hasNameChanged || hasSymbolChanged || hasUriChanged;

    // Validation
    const nameError = name.length > FIELD_CONFIG.name.maxLength;
    const symbolError = symbol.length > FIELD_CONFIG.symbol.maxLength;
    const uriError = uri.length > FIELD_CONFIG.uri.maxLength;
    const hasValidationErrors = nameError || symbolError || uriError;

    const handleUpdate = async () => {
        if (!walletAddress) {
            setError(MODAL_ERRORS.WALLET_NOT_CONNECTED);
            return;
        }

        if (!hasChanges) {
            setError('No changes to save');
            return;
        }

        if (hasValidationErrors) {
            setError('Please fix validation errors before saving');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

            // Only include fields that have changed
            const updates: MetadataUpdate[] = [];
            if (hasNameChanged) updates.push({ field: 'name', value: name.trim() });
            if (hasSymbolChanged) updates.push({ field: 'symbol', value: symbol.trim() });
            if (hasUriChanged) updates.push({ field: 'uri', value: uri.trim() });

            const options: UpdateMetadataBatchOptions = {
                mintAddress,
                updates,
                rpcUrl,
            };

            const result = await updateTokenMetadataBatch(options, transactionSendingSigner);

            if (result.success && result.transactionSignature) {
                setSuccess(true);
                setTransactionSignature(result.transactionSignature);
                setUpdatedFields(result.updatedFields || []);

                // Update local cache with the new metadata values
                onSuccess?.({
                    ...(hasNameChanged && { name: name.trim() }),
                    ...(hasSymbolChanged && { symbol: symbol.trim() }),
                    ...(hasUriChanged && { uri: uri.trim() }),
                });
            } else {
                setError(result.error || 'Update failed');
            }
        } catch (err) {
            setError(humanizeError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setName(currentName || '');
        setSymbol(currentSymbol || '');
        setUri(currentUri || '');
        setUpdatedFields([]);
        reset();
    };

    useEffect(() => {
        return () => resetForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getSuccessMessage = () => {
        // Filter updatedFields to only include keys that exist in FIELD_CONFIG, preserving order
        const validFields = updatedFields.filter(f => f in FIELD_CONFIG);

        // Map to labels with fallback for unexpected keys (defensive programming)
        const fieldLabels = validFields.map(f => {
            const config = FIELD_CONFIG[f as keyof typeof FIELD_CONFIG];
            return config?.label ?? f;
        });

        if (fieldLabels.length === 1) {
            return `${fieldLabels[0]} has been updated`;
        }
        if (fieldLabels.length === 2) {
            return `${fieldLabels[0]} and ${fieldLabels[1]} have been updated`;
        }
        return `${fieldLabels.slice(0, -1).join(', ')}, and ${fieldLabels[fieldLabels.length - 1]} have been updated`;
    };

    const getChangeCount = () => {
        return [hasNameChanged, hasSymbolChanged, hasUriChanged].filter(Boolean).length;
    };

    return (
        <ExtensionModal
            title="Update Metadata"
            successTitle="Update Successful"
            description="Update your token's name, symbol, and metadata URI"
            icon={FileText}
            iconClassName="text-primary"
            isSuccess={success}
            onClose={resetForm}
            successView={
                <TransactionSuccessView
                    title="Metadata updated successfully!"
                    message={getSuccessMessage()}
                    transactionSignature={transactionSignature}
                    cluster={(cluster as { name?: string })?.name}
                />
            }
        >
            <div className="space-y-2">
                <Label htmlFor="token-name">
                    {FIELD_CONFIG.name.label}
                    {hasNameChanged && <span className="text-primary ml-1">•</span>}
                </Label>
                <Input
                    id="token-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={FIELD_CONFIG.name.placeholder}
                    className={`rounded-xl h-12 ${nameError ? 'border-destructive' : ''}`}
                    disabled={isLoading}
                    maxLength={FIELD_CONFIG.name.maxLength + 10}
                />
                <p className={`text-xs ${nameError ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {name.length}/{FIELD_CONFIG.name.maxLength} characters
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="token-symbol">
                    {FIELD_CONFIG.symbol.label}
                    {hasSymbolChanged && <span className="text-primary ml-1">•</span>}
                </Label>
                <Input
                    id="token-symbol"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    placeholder={FIELD_CONFIG.symbol.placeholder}
                    className={`rounded-xl h-12 ${symbolError ? 'border-destructive' : ''}`}
                    disabled={isLoading}
                    maxLength={FIELD_CONFIG.symbol.maxLength + 10}
                />
                <p className={`text-xs ${symbolError ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {symbol.length}/{FIELD_CONFIG.symbol.maxLength} characters
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="token-uri">
                    {FIELD_CONFIG.uri.label}
                    {hasUriChanged && <span className="text-primary ml-1">•</span>}
                </Label>
                <Input
                    id="token-uri"
                    value={uri}
                    onChange={e => setUri(e.target.value)}
                    placeholder={FIELD_CONFIG.uri.placeholder}
                    className={`rounded-xl h-12 ${uriError ? 'border-destructive' : ''}`}
                    disabled={isLoading}
                    maxLength={FIELD_CONFIG.uri.maxLength + 10}
                />
                <p className={`text-xs ${uriError ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {uri.length}/{FIELD_CONFIG.uri.maxLength} characters
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

            <ModalError error={error} />

            <ModalFooter
                isLoading={isLoading}
                onAction={handleUpdate}
                actionLabel={
                    hasChanges
                        ? `Update ${getChangeCount()} Field${getChangeCount() > 1 ? 's' : ''}`
                        : 'Update Metadata'
                }
                loadingLabel="Updating..."
                actionDisabled={!hasChanges || hasValidationErrors}
                disabledLabel={!hasChanges ? 'No Changes' : undefined}
            />
        </ExtensionModal>
    );
}
