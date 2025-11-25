import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomTokenOptions, CustomTokenCreationResult } from '@/types/token';
import { CustomTokenBasicParams } from './custom-token-basic-params';
import { CustomTokenExtensionSelector } from './custom-token-extension-selector';
import { CustomTokenAuthorityParams } from './custom-token-authority-params';
import { CustomTokenCreationResultDisplay } from './custom-token-creation-result';
import { createCustomToken } from '@/lib/issuance/custom-token';
import type { TransactionModifyingSigner } from '@solana/signers';
import { TokenStorage, createTokenDisplayFromResult } from '@/lib/token/token-storage';

interface CustomTokenCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onTokenCreated?: () => void;
}

export function CustomTokenCreateForm({ transactionSendingSigner, onTokenCreated }: CustomTokenCreateFormProps) {
    const [customTokenOptions, setCustomTokenOptions] = useState<CustomTokenOptions>({
        name: '',
        symbol: '',
        decimals: '6',
        uri: '',
        enableMetadata: true, // Default to enabled
        enablePausable: false,
        enablePermanentDelegate: false,
        enableDefaultAccountState: false,
        enableConfidentialBalances: false,
        enableScaledUiAmount: false,
        enableSrfc37: false,
        aclMode: 'blocklist',
        mintAuthority: '',
        metadataAuthority: '',
        pausableAuthority: '',
        permanentDelegateAuthority: '',
        confidentialBalancesAuthority: '',
        scaledUiAmountAuthority: '',
        scaledUiAmountMultiplier: '1',
        scaledUiAmountNewMultiplier: '1',
        defaultAccountStateInitialized: true,
        freezeAuthority: '',
    });
    const [isCreating, setIsCreating] = useState(false);
    const [result, setResult] = useState<CustomTokenCreationResult | null>(null);

    const handleInputChange = (field: string, value: string | boolean) => {
        setCustomTokenOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsCreating(true);
        setResult(null);

        try {
            const result = await createCustomToken(customTokenOptions, transactionSendingSigner);

            if (result.success && result.mintAddress) {
                const addrValue: unknown = (
                    transactionSendingSigner as {
                        address?: unknown;
                    }
                ).address;
                const defaultAuthority =
                    typeof addrValue === 'string'
                        ? addrValue
                        : typeof addrValue === 'object' && addrValue !== null && 'toString' in addrValue
                          ? String((addrValue as { toString: () => string }).toString())
                          : '';

                const derivedMintAuthority = customTokenOptions.mintAuthority || defaultAuthority;
                const derivedMetadataAuthority = customTokenOptions.metadataAuthority || derivedMintAuthority;
                const derivedPausableAuthority = customTokenOptions.pausableAuthority || derivedMintAuthority;
                const derivedConfidentialBalancesAuthority =
                    customTokenOptions.confidentialBalancesAuthority || derivedMintAuthority;
                const derivedPermanentDelegateAuthority =
                    customTokenOptions.permanentDelegateAuthority || derivedMintAuthority;
                const derivedScaledUiAmountAuthority =
                    customTokenOptions.scaledUiAmountAuthority || derivedMintAuthority;

                // Build extensions list
                const extensions: string[] = [];
                if (customTokenOptions.enableMetadata) extensions.push('Metadata');
                if (customTokenOptions.enablePausable) extensions.push('Pausable');
                if (customTokenOptions.enablePermanentDelegate) extensions.push('Permanent Delegate');
                if (customTokenOptions.enableDefaultAccountState) {
                    extensions.push(
                        `Default Account State (${customTokenOptions.defaultAccountStateInitialized ? 'Initialized' : 'Frozen'})`
                    );
                }
                if (customTokenOptions.enableConfidentialBalances) extensions.push('Confidential Balances');
                if (customTokenOptions.enableScaledUiAmount) extensions.push('Scaled UI Amount');
                if (customTokenOptions.enableSrfc37) {
                    extensions.push(`SRFC-37 (${customTokenOptions.aclMode === 'allowlist' ? 'Allowlist' : 'Blocklist'})`);
                }

                // Create token display object
                const tokenDisplay = createTokenDisplayFromResult(result, 'custom-token', customTokenOptions);

                // Save to local storage
                TokenStorage.saveToken(tokenDisplay);

                // Call the callback to notify parent
                onTokenCreated?.();

                setResult({
                    success: true,
                    mintAddress: result.mintAddress,
                    transactionSignature: result.transactionSignature,
                    details: {
                        ...customTokenOptions,
                        decimals: parseInt(customTokenOptions.decimals),
                        aclMode: customTokenOptions.aclMode,
                        mintAuthority: derivedMintAuthority,
                        metadataAuthority: derivedMetadataAuthority,
                        pausableAuthority: derivedPausableAuthority,
                        confidentialBalancesAuthority: derivedConfidentialBalancesAuthority,
                        permanentDelegateAuthority: derivedPermanentDelegateAuthority,
                        scaledUiAmountAuthority: derivedScaledUiAmountAuthority,
                        scaledUiAmountMultiplier: customTokenOptions.scaledUiAmountMultiplier
                            ? parseFloat(customTokenOptions.scaledUiAmountMultiplier)
                            : undefined,
                        defaultAccountStateInitialized: customTokenOptions.defaultAccountStateInitialized,
                        extensions,
                    },
                });
            } else {
                setResult({
                    success: false,
                    error: result.error || 'Unknown error occurred',
                });
            }
        } catch (error) {
            setResult({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            });
        } finally {
            setIsCreating(false);
        }
    };

    if (result) {
        return <CustomTokenCreationResultDisplay result={result} />;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <CustomTokenBasicParams options={customTokenOptions} onInputChange={handleInputChange} />
            <CustomTokenExtensionSelector options={customTokenOptions} onInputChange={handleInputChange} />
            <CustomTokenAuthorityParams options={customTokenOptions} onInputChange={handleInputChange} />

            <div className="flex gap-4">
                <Button type="submit" disabled={isCreating} className="flex-1">
                    {isCreating ? 'Creating Custom Token...' : 'Create Custom Token'}
                </Button>
            </div>
        </form>
    );
}






