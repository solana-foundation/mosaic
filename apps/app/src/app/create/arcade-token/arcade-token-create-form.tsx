import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
import { ArcadeTokenBasicParams } from './arcade-token-basic-params';
import { ArcadeTokenAuthorityParams } from './arcade-token-authority-params';
import { ArcadeTokenCreationResultDisplay } from '@/app/create/arcade-token/arcade-token-creation-result';
import { createArcadeToken } from '@/lib/issuance/arcade-token';
import type { TransactionModifyingSigner } from '@solana/signers';
import { createTokenDisplayFromResult } from '@/lib/token/token-storage';
import { useTokenStore } from '@/stores/token-store';

interface ArcadeTokenCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
}

export function ArcadeTokenCreateForm({ transactionSendingSigner, rpcUrl, onTokenCreated }: ArcadeTokenCreateFormProps) {
    const addToken = useTokenStore((state) => state.addToken);
    const [arcadeTokenOptions, setArcadeTokenOptions] = useState<ArcadeTokenOptions>({
        name: '',
        symbol: '',
        decimals: '6',
        uri: '',
        enableSrfc37: false,
        mintAuthority: '',
        metadataAuthority: '',
        pausableAuthority: '',
        permanentDelegateAuthority: '',
    });
    const [isCreating, setIsCreating] = useState(false);
    const [result, setResult] = useState<ArcadeTokenCreationResult | null>(null);

    const handleInputChange = (field: string, value: string | boolean) => {
        setArcadeTokenOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsCreating(true);
        setResult(null);

        try {
            const result = await createArcadeToken({ ...arcadeTokenOptions, rpcUrl }, transactionSendingSigner);

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

                // Create token display object with creator wallet
                const tokenDisplay = createTokenDisplayFromResult(result, 'arcade-token', arcadeTokenOptions, defaultAuthority);

                // Save to store (automatically persists to localStorage)
                addToken(tokenDisplay);

                // Call the callback to notify parent
                onTokenCreated?.();

                setResult({
                    success: true,
                    mintAddress: result.mintAddress,
                    transactionSignature: result.transactionSignature,
                    details: {
                        ...arcadeTokenOptions,
                        decimals: parseInt(arcadeTokenOptions.decimals),
                        enableSrfc37: arcadeTokenOptions.enableSrfc37 || false,
                        mintAuthority: arcadeTokenOptions.mintAuthority || defaultAuthority,
                        metadataAuthority: arcadeTokenOptions.metadataAuthority || defaultAuthority,
                        pausableAuthority: arcadeTokenOptions.pausableAuthority || defaultAuthority,
                        permanentDelegateAuthority: arcadeTokenOptions.permanentDelegateAuthority || defaultAuthority,
                        extensions: ['Metadata', 'Pausable', 'Default Account State (Allowlist)', 'Permanent Delegate'],
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
        setArcadeTokenOptions({
            name: '',
            symbol: '',
            decimals: '6',
            uri: '',
            enableSrfc37: false,
            mintAuthority: '',
            metadataAuthority: '',
            pausableAuthority: '',
            permanentDelegateAuthority: '',
        });
        setResult(null);
    };

    return (
        <>
            {result ? (
                <>
                    <ArcadeTokenCreationResultDisplay result={result} />
                    <div className="flex gap-4">
                        <Button type="button" variant="outline" onClick={handleReset}>
                            Create another arcade token
                        </Button>
                    </div>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <ArcadeTokenBasicParams options={arcadeTokenOptions} onInputChange={handleInputChange} />

                    <ArcadeTokenAuthorityParams options={arcadeTokenOptions} onInputChange={handleInputChange} />

                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={
                                isCreating ||
                                !arcadeTokenOptions.name ||
                                !arcadeTokenOptions.symbol ||
                                !arcadeTokenOptions.decimals
                            }
                        >
                            {isCreating ? 'Creating Arcade Token...' : 'Create Arcade Token'}
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
