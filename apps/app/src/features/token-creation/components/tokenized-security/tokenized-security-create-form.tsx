import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TokenizedSecurityCreationResultDisplay } from './tokenized-security-creation-result';
import { ChevronRight } from 'lucide-react';
import { TokenizedSecurityOptions, TokenizedSecurityCreationResult } from '@/types/token';
import { TokenizedSecurityBasicParams } from './tokenized-security-basic-params';
import { TokenizedSecurityAuthorityParams } from './tokenized-security-authority-params';
import { createTokenizedSecurity } from '@/features/token-creation/lib/tokenized-security';
import type { TransactionModifyingSigner } from '@solana/signers';
import { createTokenDisplayFromResult } from '@/features/token-creation/lib/token-storage';
import { useTokenStore } from '@/stores/token-store';

export function TokenizedSecurityCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
}: {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
}) {
    const addToken = useTokenStore(state => state.addToken);
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

    const handleInputChange = (field: keyof TokenizedSecurityOptions, value: string | boolean) => {
        setOptions(prev => {
            // Keep booleans as booleans for toggle fields, strings for text inputs
            if (typeof value === 'boolean') {
                return { ...prev, [field]: value };
            }
            return { ...prev, [field]: value };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);
        setCreationResult(null);
        try {
            const result = await createTokenizedSecurity({ ...options, rpcUrl }, transactionSendingSigner);
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

                const tokenDisplay = await createTokenDisplayFromResult(
                    result,
                    'tokenized-security',
                    options,
                    creatorWallet,
                );
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
                            <div className="space-y-2">
                                <Label htmlFor="multiplier">Scaled UI Amount Multiplier</Label>
                                <Input
                                    id="multiplier"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={options.multiplier || '1'}
                                    onChange={e => handleInputChange('multiplier', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="access-control-mode">Access Control Mode</Label>
                                <Select
                                    value={options.aclMode || 'blocklist'}
                                    onValueChange={value => handleInputChange('aclMode', value)}
                                >
                                    <SelectTrigger id="access-control-mode" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="blocklist">Blocklist (for sanctions, etc)</SelectItem>
                                        <SelectItem value="allowlist">Allowlist (Closed-loop)</SelectItem>
                                    </SelectContent>
                                </Select>
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
