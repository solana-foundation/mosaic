'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TokenizedSecurityOptions } from '@/types/token';
import { ShieldCheck, ShieldX, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenizedSecurityFeaturesStepProps {
    options: TokenizedSecurityOptions;
    onInputChange: (field: keyof TokenizedSecurityOptions, value: string | boolean) => void;
}

export function TokenizedSecurityFeaturesStep({ options, onInputChange }: TokenizedSecurityFeaturesStepProps) {
    const multiplier = parseFloat(options.multiplier || '1') || 1;

    return (
        <div className="space-y-4">
            {/* Scaled UI Amount Configuration */}
            <Card className="py-4 rounded-3xl">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div>
                            <CardTitle className="text-base">Scaled UI Amount</CardTitle>
                            <CardDescription className="text-xs">
                                Configure how token amounts are displayed
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                        <div className="space-y-1">
                            <Label htmlFor="scaledUiAmountMultiplier" className="text-xs text-muted-foreground">
                                Display Multiplier
                            </Label>
                            <Input
                                id="scaledUiAmountMultiplier"
                                type="number"
                                placeholder="1"
                                value={options.multiplier || ''}
                                onChange={e => onInputChange('multiplier', e.target.value)}
                                min={0.000001}
                                step={0.000001}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Info className="h-4 w-4" />
                            <span>
                                Preview: 1,000 tokens × {multiplier} = {(1000 * multiplier).toLocaleString()} displayed
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Access Control Configuration */}
            <Card className="py-4 rounded-3xl">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div>
                            <CardTitle className="text-base">Access Control Mode</CardTitle>
                            <CardDescription className="text-xs">
                                Configure transfer restrictions
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => onInputChange('aclMode', 'allowlist')}
                            className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                                options.aclMode === 'allowlist'
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                            )}
                        >
                            <ShieldCheck
                                className={cn(
                                    'h-6 w-6',
                                    options.aclMode === 'allowlist' ? 'text-primary' : 'text-muted-foreground'
                                )}
                            />
                            <div className="text-center">
                                <p className="text-sm font-medium">Allowlist</p>
                                <p className="text-xs text-muted-foreground">Only approved addresses can transfer</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => onInputChange('aclMode', 'blocklist')}
                            className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                                options.aclMode === 'blocklist' || !options.aclMode
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                            )}
                        >
                            <ShieldX
                                className={cn(
                                    'h-6 w-6',
                                    options.aclMode === 'blocklist' || !options.aclMode
                                        ? 'text-primary'
                                        : 'text-muted-foreground'
                                )}
                            />
                            <div className="text-center">
                                <p className="text-sm font-medium">Blocklist</p>
                                <p className="text-xs text-muted-foreground">Block specific addresses from transfers</p>
                            </div>
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
