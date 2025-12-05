import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomTokenOptions } from '@/types/token';

interface CustomTokenBasicParamsProps {
    options: CustomTokenOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function CustomTokenBasicParams({ options, onInputChange }: CustomTokenBasicParamsProps) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Basic Parameters</CardTitle>
                <CardDescription>Configure the fundamental properties of your token</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="custom-name">Token Name *</Label>
                        <Input
                            id="custom-name"
                            type="text"
                            placeholder="e.g., My Token"
                            value={options.name}
                            onChange={e => onInputChange('name', e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="custom-symbol">Symbol *</Label>
                        <Input
                            id="custom-symbol"
                            type="text"
                            placeholder="e.g., TOKEN"
                            value={options.symbol}
                            onChange={e => onInputChange('symbol', e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="custom-decimals">Decimals *</Label>
                        <Input
                            id="custom-decimals"
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
                        <Label htmlFor="custom-uri">Metadata URI</Label>
                        <Input
                            id="custom-uri"
                            type="url"
                            placeholder="https://example.com/metadata.json"
                            value={options.uri}
                            onChange={e => onInputChange('uri', e.target.value)}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
