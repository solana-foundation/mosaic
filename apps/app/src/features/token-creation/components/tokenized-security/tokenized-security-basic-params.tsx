import { EnableSrfc37Toggle } from '@/features/token-creation/components/enable-srfc37-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TokenizedSecurityOptions } from '@/types/token';

export function TokenizedSecurityBasicParams({
    options,
    onInputChange,
}: {
    options: TokenizedSecurityOptions;
    onInputChange: (field: keyof TokenizedSecurityOptions, value: string | boolean) => void;
}) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Basic Parameters</CardTitle>
                <CardDescription>Configure the fundamental properties of your tokenized security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="security-name">Token Name *</Label>
                        <Input
                            id="security-name"
                            type="text"
                            placeholder="e.g., ABC Security"
                            value={options.name}
                            onChange={e => onInputChange('name', e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="security-symbol">Symbol *</Label>
                        <Input
                            id="security-symbol"
                            type="text"
                            placeholder="e.g., ABCS"
                            value={options.symbol}
                            onChange={e => onInputChange('symbol', e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="security-decimals">Decimals *</Label>
                        <Input
                            id="security-decimals"
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
                        <Label htmlFor="security-uri">Metadata URI</Label>
                        <Input
                            id="security-uri"
                            type="url"
                            placeholder="https://example.com/metadata.json"
                            value={options.uri || ''}
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
