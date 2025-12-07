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
        <Card className="py-4 rounded-3xl">
            <CardHeader className="sr-only">
                <CardTitle>Token Identity</CardTitle>
                <CardDescription>Configure the basic properties of your tokenized security</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-6 py-2">
                    <div className="flex flex-col items-center justify-center">
                        <TokenImagePreview uri={options.uri || ''} symbol={options.symbol || ''} />
                    </div>
                    <div className="space-y-2">
                            <Label htmlFor="security-uri">Metadata URI</Label>
                            <Input
                                id="security-uri"
                                type="url"
                                placeholder="https://example.com/metadata.json"
                                value={options.uri}
                                onChange={e => onInputChange('uri', e.target.value)}
                            />
                    </div>
                    
                    <div className="space-y-4">
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
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
