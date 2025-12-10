'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight } from 'lucide-react';
import { StablecoinOptions } from '@/types/token';

interface StablecoinAuthorityParamsProps {
    options: StablecoinOptions;
    onInputChange: (field: string, value: string | boolean) => void;
    alwaysExpanded?: boolean;
}

export function StablecoinAuthorityParams({
    options,
    onInputChange,
    alwaysExpanded = false,
}: StablecoinAuthorityParamsProps) {
    const [showOptionalParams, setShowOptionalParams] = useState(alwaysExpanded);
    const isExpanded = alwaysExpanded || showOptionalParams;

    return (
        <Card>
            <CardHeader>
                {alwaysExpanded ? (
                    <div>
                        <h3 className="text-lg font-semibold">Authority Parameters (Optional)</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure authorities for advanced token management
                        </p>
                    </div>
                ) : (
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
                )}
            </CardHeader>
            {isExpanded && (
                <CardContent id="stablecoin-authority-params" className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="stablecoin-mint-authority">Mint Authority</Label>
                        <Input
                            id="stablecoin-mint-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.mintAuthority}
                            onChange={e => onInputChange('mintAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stablecoin-metadata-authority">Metadata Authority</Label>
                        <Input
                            id="stablecoin-metadata-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.metadataAuthority}
                            onChange={e => onInputChange('metadataAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stablecoin-pausable-authority">Pausable Authority</Label>
                        <Input
                            id="stablecoin-pausable-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.pausableAuthority}
                            onChange={e => onInputChange('pausableAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stablecoin-confidential-authority">Confidential Balances Authority</Label>
                        <Input
                            id="stablecoin-confidential-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.confidentialBalancesAuthority}
                            onChange={e => onInputChange('confidentialBalancesAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="stablecoin-delegate-authority">Permanent Delegate Authority</Label>
                        <Input
                            id="stablecoin-delegate-authority"
                            type="text"
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
