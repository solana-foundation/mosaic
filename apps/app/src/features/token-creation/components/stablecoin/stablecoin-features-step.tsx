'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StablecoinOptions } from '@/types/token';

interface StablecoinFeaturesStepProps {
    options: StablecoinOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function StablecoinFeaturesStep({ options, onInputChange }: StablecoinFeaturesStepProps) {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Transfer Restrictions</CardTitle>
                <CardDescription>
                    Choose whether to use an allowlist (closed-loop) or a blocklist for transfer controls.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="stablecoin-acl-mode">Access Control Mode</Label>
                    <Select
                        value={options.aclMode || 'blocklist'}
                        onValueChange={value => onInputChange('aclMode', value)}
                    >
                        <SelectTrigger id="stablecoin-acl-mode" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="blocklist">Blocklist (for sanctions, etc)</SelectItem>
                            <SelectItem value="allowlist">Allowlist (Closed-loop)</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-2">
                        {options.aclMode === 'allowlist'
                            ? 'Only addresses on the allowlist can hold and transfer tokens.'
                            : 'All addresses can hold and transfer tokens except those on the blocklist.'}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
