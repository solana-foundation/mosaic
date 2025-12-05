import { EnableSrfc37Toggle } from '@/features/token-creation/components/enable-srfc37-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArcadeTokenOptions } from '@/types/token';

interface ArcadeTokenBasicParamsProps {
    options: ArcadeTokenOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function ArcadeTokenBasicParams({ options, onInputChange }: ArcadeTokenBasicParamsProps) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Basic Parameters</CardTitle>
                <CardDescription>Configure the fundamental properties of your arcade token</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="arcade-name">Token Name *</Label>
                        <Input
                            id="arcade-name"
                            type="text"
                            placeholder="e.g., Game Token"
                            value={options.name}
                            onChange={e => onInputChange('name', e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arcade-symbol">Symbol *</Label>
                        <Input
                            id="arcade-symbol"
                            type="text"
                            placeholder="e.g., GAME"
                            value={options.symbol}
                            onChange={e => onInputChange('symbol', e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="arcade-decimals">Decimals *</Label>
                        <Input
                            id="arcade-decimals"
                            type="number"
                            placeholder="6"
                            value={options.decimals}
                            onChange={e => onInputChange('decimals', e.target.value)}
                            min={0}
                            max={9}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arcade-uri">Metadata URI</Label>
                        <Input
                            id="arcade-uri"
                            type="url"
                            placeholder="https://example.com/metadata.json"
                            value={options.uri}
                            onChange={e => onInputChange('uri', e.target.value)}
                        />
                    </div>
                </div>

                <EnableSrfc37Toggle
                    enabled={options.enableSrfc37}
                    setEnabled={value => onInputChange('enableSrfc37', value)}
                />
            </CardContent>
        </Card>
    );
}
