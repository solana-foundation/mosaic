'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TokenizedSecurityOptions } from '@/types/token';

interface TokenizedSecurityFeaturesStepProps {
    options: TokenizedSecurityOptions;
    onInputChange: (field: keyof TokenizedSecurityOptions, value: string | boolean) => void;
}

export function TokenizedSecurityFeaturesStep({ options, onInputChange }: TokenizedSecurityFeaturesStepProps) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Optional Settings</CardTitle>
                <CardDescription>Configure multiplier, access control, and other optional settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="multiplier">Scaled UI Amount Multiplier</Label>
                        <Input
                            id="multiplier"
                            type="number"
                            min={0}
                            step="any"
                            value={options.multiplier || '1'}
                            onChange={e => onInputChange('multiplier', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Display multiplier for token amounts in UIs.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="access-control-mode">Access Control Mode</Label>
                        <Select
                            value={options.aclMode || 'blocklist'}
                            onValueChange={value => onInputChange('aclMode', value)}
                        >
                            <SelectTrigger id="access-control-mode" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="blocklist">Blocklist (for sanctions, etc)</SelectItem>
                                <SelectItem value="allowlist">Allowlist (Closed-loop)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {options.aclMode === 'allowlist'
                                ? 'Only addresses on the allowlist can hold and transfer tokens.'
                                : 'All addresses can hold and transfer except those on the blocklist.'}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
