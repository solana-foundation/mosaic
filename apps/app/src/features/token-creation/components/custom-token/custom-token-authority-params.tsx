import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight } from 'lucide-react';
import { CustomTokenOptions } from '@/types/token';

interface CustomTokenAuthorityParamsProps {
    options: CustomTokenOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function CustomTokenAuthorityParams({ options, onInputChange }: CustomTokenAuthorityParamsProps) {
    const [showOptionalParams, setShowOptionalParams] = useState(false);

    // Check if any extension that requires authorities is enabled
    const hasEnabledExtensions =
        options.enableMetadata ||
        options.enablePausable ||
        options.enablePermanentDelegate ||
        options.enableConfidentialBalances ||
        options.enableScaledUiAmount;

    if (!hasEnabledExtensions) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <button
                    type="button"
                    onClick={() => setShowOptionalParams(!showOptionalParams)}
                    aria-controls="custom-token-authority-params"
                    aria-expanded={showOptionalParams}
                    className="flex items-center gap-2 text-left"
                    title={showOptionalParams ? 'Collapse' : 'Expand'}
                >
                    <ChevronRight
                        className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${showOptionalParams ? 'rotate-90' : ''}`}
                    />
                    <div>
                        <h3 className="text-lg font-semibold">Authority Parameters (Optional)</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure authorities for enabled extensions. Leave empty to use mint authority.
                        </p>
                    </div>
                </button>
            </CardHeader>
            {showOptionalParams && (
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="custom-mint-authority">Mint Authority</Label>
                        <Input
                            id="custom-mint-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.mintAuthority || ''}
                            onChange={e => onInputChange('mintAuthority', e.target.value)}
                        />
                    </div>

                    {options.enableMetadata && (
                        <div className="space-y-2">
                            <Label htmlFor="custom-metadata-authority">Metadata Authority</Label>
                            <Input
                                id="custom-metadata-authority"
                                type="text"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.metadataAuthority || ''}
                                onChange={e => onInputChange('metadataAuthority', e.target.value)}
                            />
                        </div>
                    )}

                    {options.enablePausable && (
                        <div className="space-y-2">
                            <Label htmlFor="custom-pausable-authority">Pausable Authority</Label>
                            <Input
                                id="custom-pausable-authority"
                                type="text"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.pausableAuthority || ''}
                                onChange={e => onInputChange('pausableAuthority', e.target.value)}
                            />
                        </div>
                    )}

                    {options.enablePermanentDelegate && (
                        <div className="space-y-2">
                            <Label htmlFor="custom-delegate-authority">Permanent Delegate Authority</Label>
                            <Input
                                id="custom-delegate-authority"
                                type="text"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.permanentDelegateAuthority || ''}
                                onChange={e => onInputChange('permanentDelegateAuthority', e.target.value)}
                            />
                        </div>
                    )}

                    {options.enableConfidentialBalances && (
                        <div className="space-y-2">
                            <Label htmlFor="custom-confidential-authority">Confidential Balances Authority</Label>
                            <Input
                                id="custom-confidential-authority"
                                type="text"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.confidentialBalancesAuthority || ''}
                                onChange={e => onInputChange('confidentialBalancesAuthority', e.target.value)}
                            />
                        </div>
                    )}

                    {options.enableScaledUiAmount && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="custom-scaled-authority">Scaled UI Amount Authority</Label>
                                <Input
                                    id="custom-scaled-authority"
                                    type="text"
                                    placeholder="Public key or leave empty for mint authority"
                                    value={options.scaledUiAmountAuthority || ''}
                                    onChange={e => onInputChange('scaledUiAmountAuthority', e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="custom-multiplier">Multiplier</Label>
                                    <Input
                                        id="custom-multiplier"
                                        type="number"
                                        placeholder="1"
                                        value={options.scaledUiAmountMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountMultiplier', e.target.value)}
                                        min={1}
                                        step={0.000001}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="custom-new-multiplier">New Multiplier</Label>
                                    <Input
                                        id="custom-new-multiplier"
                                        type="number"
                                        placeholder="1"
                                        value={options.scaledUiAmountNewMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountNewMultiplier', e.target.value)}
                                        min={1}
                                        step={0.000001}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {options.enableDefaultAccountState && (
                        <div className="space-y-2">
                            <Label>Default Account State</Label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="defaultAccountState"
                                        value="initialized"
                                        checked={options.defaultAccountStateInitialized !== false}
                                        onChange={() => onInputChange('defaultAccountStateInitialized', true)}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm">Initialized</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="defaultAccountState"
                                        value="frozen"
                                        checked={options.defaultAccountStateInitialized === false}
                                        onChange={() => onInputChange('defaultAccountStateInitialized', false)}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm">Frozen</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="custom-freeze-authority">Freeze Authority (Optional)</Label>
                        <Input
                            id="custom-freeze-authority"
                            type="text"
                            placeholder="Public key or leave empty for none"
                            value={options.freezeAuthority || ''}
                            onChange={e => onInputChange('freezeAuthority', e.target.value)}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
