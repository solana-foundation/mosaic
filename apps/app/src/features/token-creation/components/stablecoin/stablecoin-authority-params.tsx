'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { StablecoinOptions } from '@/types/token';

interface StablecoinAuthorityParamsProps {
    options: StablecoinOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function StablecoinAuthorityParams({ options, onInputChange }: StablecoinAuthorityParamsProps) {
    const [showOptionalParams, setShowOptionalParams] = useState(false);

    return (
        <Card>
            <CardHeader>
                <button
                    type="button"
                    onClick={() => setShowOptionalParams(!showOptionalParams)}
                    aria-controls="stablecoin-authority-params"
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
                            Configure authorities for advanced token management
                        </p>
                    </div>
                </button>
            </CardHeader>
            {showOptionalParams && (
                <CardContent id="stablecoin-authority-params" className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Mint Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.mintAuthority}
                            onChange={e => onInputChange('mintAuthority', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Metadata Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.metadataAuthority}
                            onChange={e => onInputChange('metadataAuthority', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Pausable Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.pausableAuthority}
                            onChange={e => onInputChange('pausableAuthority', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Confidential Balances Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.confidentialBalancesAuthority}
                            onChange={e => onInputChange('confidentialBalancesAuthority', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Permanent Delegate Authority</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.permanentDelegateAuthority}
                            onChange={e => onInputChange('permanentDelegateAuthority', e.target.value)}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
