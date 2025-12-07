import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TokenizedSecurityOptions } from '@/types/token';
import { TokenImagePreview } from '../token-image-preview';
import { DecimalsSelector } from '../decimals-selector';

interface TokenizedSecurityBasicParamsProps {
    options: TokenizedSecurityOptions;
    onInputChange: (field: keyof TokenizedSecurityOptions, value: string | boolean) => void;
}

export function TokenizedSecurityBasicParams({ options, onInputChange }: TokenizedSecurityBasicParamsProps) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Token Identity</CardTitle>
                <CardDescription>Configure the basic properties of your tokenized security</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex gap-6">
                    <TokenImagePreview uri={options.uri || ''} symbol={options.symbol} />

                    <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="security-name">Token Name</Label>
                            <Input
                                id="security-name"
                                type="text"
                                placeholder="e.g., ABC Security"
                                value={options.name}
                                onChange={e => onInputChange('name', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="security-symbol">Symbol</Label>
                            <Input
                                id="security-symbol"
                                type="text"
                                placeholder="e.g., ABCS"
                                value={options.symbol}
                                onChange={e => onInputChange('symbol', e.target.value)}
                            />
                        </div>

                        <DecimalsSelector
                            id="security-decimals"
                            value={options.decimals}
                            onChange={value => onInputChange('decimals', value)}
                        />

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
                </div>
            </CardContent>
        </Card>
    );
}
