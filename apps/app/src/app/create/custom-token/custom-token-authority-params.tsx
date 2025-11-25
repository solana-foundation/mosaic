import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
                    <div>
                        <label className="block text-sm font-medium mb-2">Mint Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.mintAuthority || ''}
                            onChange={e => onInputChange('mintAuthority', e.target.value)}
                        />
                    </div>
                    
                    {options.enableMetadata && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Metadata Authority</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.metadataAuthority || ''}
                                onChange={e => onInputChange('metadataAuthority', e.target.value)}
                            />
                        </div>
                    )}
                    
                    {options.enablePausable && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Pausable Authority</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.pausableAuthority || ''}
                                onChange={e => onInputChange('pausableAuthority', e.target.value)}
                            />
                        </div>
                    )}
                    
                    {options.enablePermanentDelegate && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.permanentDelegateAuthority || ''}
                                onChange={e => onInputChange('permanentDelegateAuthority', e.target.value)}
                            />
                        </div>
                    )}
                    
                    {options.enableConfidentialBalances && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Confidential Balances Authority</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg"
                                placeholder="Public key or leave empty for mint authority"
                                value={options.confidentialBalancesAuthority || ''}
                                onChange={e => onInputChange('confidentialBalancesAuthority', e.target.value)}
                            />
                        </div>
                    )}
                    
                    {options.enableScaledUiAmount && (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-2">Scaled UI Amount Authority</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border rounded-lg"
                                    placeholder="Public key or leave empty for mint authority"
                                    value={options.scaledUiAmountAuthority || ''}
                                    onChange={e => onInputChange('scaledUiAmountAuthority', e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Multiplier</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 border rounded-lg"
                                        placeholder="1"
                                        value={options.scaledUiAmountMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountMultiplier', e.target.value)}
                                        min="1"
                                        step="0.000001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">New Multiplier</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 border rounded-lg"
                                        placeholder="1"
                                        value={options.scaledUiAmountNewMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountNewMultiplier', e.target.value)}
                                        min="1"
                                        step="0.000001"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    
                    {options.enableDefaultAccountState && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Default Account State</label>
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
                    
                    <div>
                        <label className="block text-sm font-medium mb-2">Freeze Authority (Optional)</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
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





