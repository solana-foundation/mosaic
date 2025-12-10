import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomTokenOptions } from '@/types/token';
import { TokenImagePreview } from '../token-image-preview';
import { DecimalsSelector } from '../decimals-selector';

interface CustomTokenBasicParamsProps {
    options: CustomTokenOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function CustomTokenBasicParams({ options, onInputChange }: CustomTokenBasicParamsProps) {
    return (
        <Card className="py-4 rounded-3xl">
            <CardHeader className="sr-only">
                <CardTitle>Token Identity</CardTitle>
                <CardDescription>Configure the basic properties of your token</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-6 py-2">
                    <div className="flex flex-col items-center justify-center">
                        <TokenImagePreview uri={options.uri || ''} symbol={options.symbol || ''} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="custom-uri">Metadata URI</Label>
                        <Input
                            id="custom-uri"
                            type="url"
                            placeholder="https://example.com/metadata.json"
                            value={options.uri}
                            onChange={e => onInputChange('uri', e.target.value)}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="custom-name">Token Name</Label>
                            <Input
                                id="custom-name"
                                type="text"
                                placeholder="e.g., My Token"
                                value={options.name}
                                onChange={e => onInputChange('name', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="custom-symbol">Symbol</Label>
                            <Input
                                id="custom-symbol"
                                type="text"
                                placeholder="e.g., TOKEN"
                                value={options.symbol}
                                onChange={e => onInputChange('symbol', e.target.value)}
                            />
                        </div>

                        <DecimalsSelector
                            id="custom-decimals"
                            value={options.decimals}
                            onChange={value => onInputChange('decimals', value)}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
