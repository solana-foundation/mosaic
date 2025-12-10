import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight } from 'lucide-react';
import { ArcadeTokenOptions } from '@/types/token';

interface ArcadeTokenAuthorityParamsProps {
    options: ArcadeTokenOptions;
    onInputChange: (field: string, value: string) => void;
    alwaysExpanded?: boolean;
}

export function ArcadeTokenAuthorityParams({
    options,
    onInputChange,
    alwaysExpanded = false,
}: ArcadeTokenAuthorityParamsProps) {
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
                        aria-controls="arcade-token-authority-params"
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
                <CardContent id="arcade-token-authority-params" className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="arcade-mint-authority">Mint Authority</Label>
                        <Input
                            id="arcade-mint-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.mintAuthority}
                            onChange={e => onInputChange('mintAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arcade-metadata-authority">Metadata Authority</Label>
                        <Input
                            id="arcade-metadata-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.metadataAuthority}
                            onChange={e => onInputChange('metadataAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arcade-pausable-authority">Pausable Authority</Label>
                        <Input
                            id="arcade-pausable-authority"
                            type="text"
                            placeholder="Public key or leave empty for connected wallet"
                            value={options.pausableAuthority}
                            onChange={e => onInputChange('pausableAuthority', e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arcade-delegate-authority">Permanent Delegate Authority</Label>
                        <Input
                            id="arcade-delegate-authority"
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
