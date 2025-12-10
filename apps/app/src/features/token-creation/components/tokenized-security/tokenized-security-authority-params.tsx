import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TokenizedSecurityOptions } from '@/types/token';

export function TokenizedSecurityAuthorityParams({
    options,
    onInputChange,
}: {
    options: TokenizedSecurityOptions;
    onInputChange: (field: keyof TokenizedSecurityOptions, value: string | boolean) => void;
}) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Authority Parameters (Optional)</CardTitle>
                <CardDescription>
                    Configure authorities for advanced token management. Leave empty to use connected wallet.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="mintAuthority">Mint Authority</Label>
                    <Input
                        id="mintAuthority"
                        placeholder="Wallet address"
                        value={options.mintAuthority || ''}
                        onChange={e => onInputChange('mintAuthority', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="metadataAuthority">Metadata Update Authority</Label>
                    <Input
                        id="metadataAuthority"
                        placeholder="Wallet address"
                        value={options.metadataAuthority || ''}
                        onChange={e => onInputChange('metadataAuthority', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="pausableAuthority">Pausable Authority</Label>
                    <Input
                        id="pausableAuthority"
                        placeholder="Wallet address"
                        value={options.pausableAuthority || ''}
                        onChange={e => onInputChange('pausableAuthority', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confidentialBalancesAuthority">Confidential Balances Authority</Label>
                    <Input
                        id="confidentialBalancesAuthority"
                        placeholder="Wallet address"
                        value={options.confidentialBalancesAuthority || ''}
                        onChange={e => onInputChange('confidentialBalancesAuthority', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="permanentDelegateAuthority">Permanent Delegate Authority</Label>
                    <Input
                        id="permanentDelegateAuthority"
                        placeholder="Wallet address"
                        value={options.permanentDelegateAuthority || ''}
                        onChange={e => onInputChange('permanentDelegateAuthority', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="scaledUiAmountAuthority">Scaled UI Amount Authority</Label>
                    <Input
                        id="scaledUiAmountAuthority"
                        placeholder="Wallet address"
                        value={options.scaledUiAmountAuthority || ''}
                        onChange={e => onInputChange('scaledUiAmountAuthority', e.target.value)}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
