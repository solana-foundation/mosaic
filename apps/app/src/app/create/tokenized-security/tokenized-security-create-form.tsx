import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TokenizedSecurityCreationResultDisplay } from './tokenized-security-creation-result';
import { ChevronRight } from 'lucide-react';
import { TokenizedSecurityOptions, TokenizedSecurityCreationResult } from '@/types/token';
import { TokenizedSecurityBasicParams } from './tokenized-security-basic-params';
import { TokenizedSecurityAuthorityParams } from './tokenized-security-authority-params';
import { createTokenizedSecurity } from '@/lib/issuance/tokenized-security';
import type { TransactionModifyingSigner } from '@solana/signers';
import { createTokenDisplayFromResult } from '@/lib/token/token-storage';
import { useTokenStore } from '@/stores/token-store';

export function TokenizedSecurityCreateForm({
    transactionSendingSigner,
    onTokenCreated,
}: {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    onTokenCreated?: () => void;
}) {
    const addToken = useTokenStore((state) => state.addToken);
    const [options, setOptions] = useState<TokenizedSecurityOptions>({
        name: '',
        symbol: '',
        decimals: '6',
        uri: '',
        aclMode: 'blocklist',
        enableSrfc37: false,
        mintAuthority: '',
        metadataAuthority: '',
        pausableAuthority: '',
        confidentialBalancesAuthority: '',
        permanentDelegateAuthority: '',
        scaledUiAmountAuthority: '',
        multiplier: '1',
    });
    const [isCreating, setIsCreating] = useState(false);
    const [creationResult, setCreationResult] = useState<TokenizedSecurityCreationResult | null>(null);
    const [showOptional, setShowOptional] = useState(false);

    const handleInputChange = (field: keyof TokenizedSecurityOptions, value: string) => {
        setOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);
        setCreationResult(null);
        try {
            const result = await createTokenizedSecurity(options, transactionSendingSigner);
            if (result.success && result.mintAddress) {
                const addrValue: unknown = (
                    transactionSendingSigner as {
                        address?: unknown;
                    }
                ).address;
                const creatorWallet =
                    typeof addrValue === 'string'
                        ? addrValue
                        : typeof addrValue === 'object' && addrValue !== null && 'toString' in addrValue
                          ? String((addrValue as { toString: () => string }).toString())
                          : '';

                const tokenDisplay = createTokenDisplayFromResult(result, 'tokenized-security', options, creatorWallet);
                // Save to store (automatically persists to localStorage)
                addToken(tokenDisplay);
                
                // Call the callback to notify parent
                onTokenCreated?.();
            }
            setCreationResult(result);
        } catch (error) {
            setCreationResult({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleReset = () => {
        setOptions({
            name: '',
            symbol: '',
            decimals: '6',
            uri: '',
            aclMode: 'blocklist',
            enableSrfc37: false,
            mintAuthority: '',
            metadataAuthority: '',
            pausableAuthority: '',
            confidentialBalancesAuthority: '',
            permanentDelegateAuthority: '',
            scaledUiAmountAuthority: '',
            multiplier: '1',
        });
        setCreationResult(null);
    };

    if (creationResult) {
        return (
            <div className="space-y-6">
                <TokenizedSecurityCreationResultDisplay result={creationResult} />
                <Button type="button" variant="outline" onClick={handleReset}>
                    Create another tokenized security
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <TokenizedSecurityBasicParams options={options} onInputChange={handleInputChange} />

            <div className="rounded-lg border">
                <div className="p-6 border-b">
                    <button
                        type="button"
                        aria-expanded={showOptional}
                        aria-controls="optional-settings"
                        onClick={() => setShowOptional(prev => !prev)}
                        className="flex w-full items-start gap-3 text-left"
                        title={showOptional ? 'Collapse' : 'Expand'}
                    >
                        <ChevronRight
                            className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${showOptional ? 'rotate-90' : ''}`}
                        />
                        <div>
                            <h3 className="text-lg font-semibold">Optional Settings</h3>
                            <p className="text-sm text-muted-foreground">
                                Configure multiplier, access control, and authorities (optional).
                            </p>
                        </div>
                    </button>
                </div>
                {showOptional && (
                    <div id="optional-settings" className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium" htmlFor="multiplier">
                                    Scaled UI Amount Multiplier
                                </label>
                                <input
                                    id="multiplier"
                                    type="number"
                                    min={0}
                                    step="any"
                                    className="w-full p-3 border rounded-lg"
                                    value={options.multiplier || '1'}
                                    onChange={e => handleInputChange('multiplier', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Access Control Mode</label>
                                <select
                                    className="w-full p-3 border rounded-lg"
                                    value={options.aclMode || 'blocklist'}
                                    onChange={e => handleInputChange('aclMode', e.target.value)}
                                >
                                    <option value="blocklist">Blocklist (for sanctions, etc)</option>
                                    <option value="allowlist">Allowlist (Closed-loop)</option>
                                </select>
                            </div>
                        </div>

                        <TokenizedSecurityAuthorityParams options={options} onInputChange={handleInputChange} />
                    </div>
                )}
            </div>

            <div className="flex gap-4">
                <Button
                    type="submit"
                    className="flex-1"
                    disabled={isCreating || !options.name || !options.symbol || !options.decimals}
                >
                    {isCreating ? 'Creating Tokenized Security...' : 'Create Tokenized Security'}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                    Reset
                </Button>
            </div>
        </form>
    );
}
