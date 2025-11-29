import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StablecoinOptions, StablecoinCreationResult } from '@/types/token';
import { StablecoinBasicParams } from './stablecoin-basic-params';
import { StablecoinAuthorityParams } from './stablecoin-authority-params';
import { StablecoinCreationResultDisplay } from '@/app/create/stablecoin/stablecoin-creation-result';
import { createStablecoin } from '@/lib/issuance/stablecoin';
import type { TransactionModifyingSigner } from '@solana/signers';
import { createTokenDisplayFromResult } from '@/lib/token/token-storage';
import { useTokenStore } from '@/stores/token-store';

interface StablecoinCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
}

export function StablecoinCreateForm({ transactionSendingSigner, rpcUrl, onTokenCreated }: StablecoinCreateFormProps) {
    const addToken = useTokenStore((state) => state.addToken);
    const [stablecoinOptions, setStablecoinOptions] = useState<StablecoinOptions>({
        name: '',
        symbol: '',
        decimals: '6',
        uri: '',
        enableSrfc37: false,
        aclMode: 'blocklist',
        mintAuthority: '',
        metadataAuthority: '',
        pausableAuthority: '',
        confidentialBalancesAuthority: '',
        permanentDelegateAuthority: '',
    });
    const [isCreating, setIsCreating] = useState(false);
    const [result, setResult] = useState<StablecoinCreationResult | null>(null);

    const handleInputChange = (field: string, value: string | boolean) => {
        setStablecoinOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsCreating(true);
        setResult(null);

        try {
            const result = await createStablecoin({ ...stablecoinOptions, rpcUrl }, transactionSendingSigner);

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

                const derivedMintAuthority = stablecoinOptions.mintAuthority || defaultAuthority;
                const derivedMetadataAuthority = stablecoinOptions.metadataAuthority || derivedMintAuthority;
                const derivedPausableAuthority = stablecoinOptions.pausableAuthority || derivedMintAuthority;
                const derivedConfidentialBalancesAuthority =
                    stablecoinOptions.confidentialBalancesAuthority || derivedMintAuthority;
                const derivedPermanentDelegateAuthority =
                    stablecoinOptions.permanentDelegateAuthority || derivedMintAuthority;
                // Create token display object with creator wallet
                const tokenDisplay = createTokenDisplayFromResult(result, 'stablecoin', stablecoinOptions, defaultAuthority);

                // Save to store (automatically persists to localStorage)
                addToken(tokenDisplay);

                // Call the callback to notify parent
                onTokenCreated?.();

                setResult({
                    success: true,
                    mintAddress: result.mintAddress,
                    transactionSignature: result.transactionSignature,
                    details: {
                        ...stablecoinOptions,
                        decimals: parseInt(stablecoinOptions.decimals),
                        aclMode: stablecoinOptions.aclMode,
                        mintAuthority: derivedMintAuthority,
                        metadataAuthority: derivedMetadataAuthority,
                        pausableAuthority: derivedPausableAuthority,
                        confidentialBalancesAuthority: derivedConfidentialBalancesAuthority,
                        permanentDelegateAuthority: derivedPermanentDelegateAuthority,
                        extensions: [
                            'Metadata',
                            'Pausable',
                            `Default Account State (${stablecoinOptions.aclMode === 'allowlist' ? 'Allowlist' : 'Blocklist'})`,
                            'Confidential Balances',
                            'Permanent Delegate',
                        ],
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

    const handleReset = () => {
        setStablecoinOptions({
            name: '',
            symbol: '',
            decimals: '6',
            uri: '',
            enableSrfc37: false,
            aclMode: 'blocklist',
            mintAuthority: '',
            metadataAuthority: '',
            pausableAuthority: '',
            confidentialBalancesAuthority: '',
            permanentDelegateAuthority: '',
        });
        setResult(null);
    };

    return (
        <>
            {result ? (
                <>
                    <StablecoinCreationResultDisplay result={result} />
                    <div className="flex gap-4">
                        <Button type="button" variant="outline" onClick={handleReset}>
                            Create another stablecoin
                        </Button>
                    </div>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <StablecoinBasicParams options={stablecoinOptions} onInputChange={handleInputChange} />

                    <div className="rounded-lg border">
                        <div className="p-6 border-b">
                            <h3 className="text-lg font-semibold">Transfer Restrictions</h3>
                            <p className="text-sm text-muted-foreground">
                                Choose whether to use an allowlist (closed-loop) or a blocklist.
                            </p>
                        </div>
                        <div className="p-6 space-y-2">
                            <label className="block text-sm font-medium">Access Control Mode</label>
                            <select
                                className="w-full p-3 border rounded-lg"
                                value={stablecoinOptions.aclMode || 'blocklist'}
                                onChange={e => handleInputChange('aclMode', e.target.value)}
                            >
                                <option value="blocklist">Blocklist (for sanctions, etc)</option>
                                <option value="allowlist">Allowlist (Closed-loop)</option>
                            </select>
                        </div>
                    </div>

                    <StablecoinAuthorityParams options={stablecoinOptions} onInputChange={handleInputChange} />

                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={
                                isCreating ||
                                !stablecoinOptions.name ||
                                !stablecoinOptions.symbol ||
                                !stablecoinOptions.decimals
                            }
                        >
                            {isCreating ? 'Creating Stablecoin...' : 'Create Stablecoin'}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleReset}>
                            Reset
                        </Button>
                    </div>
                </form>
            )}
        </>
    );
}
