'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StablecoinOptions } from '@/types/token';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StablecoinFeaturesStepProps {
    options: StablecoinOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function StablecoinFeaturesStep({ options, onInputChange }: StablecoinFeaturesStepProps) {
    return (
        <Card className="py-4 rounded-3xl">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div>
                        <CardTitle className="text-base">Access Control Mode</CardTitle>
                        <CardDescription className="text-xs">Configure transfer restrictions</CardDescription>
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
                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50',
                        )}
                    >
                        <ShieldCheck
                            className={cn(
                                'h-6 w-6',
                                options.aclMode === 'allowlist' ? 'text-primary' : 'text-muted-foreground',
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
                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50',
                        )}
                    >
                        <ShieldX
                            className={cn(
                                'h-6 w-6',
                                options.aclMode === 'blocklist' || !options.aclMode
                                    ? 'text-primary'
                                    : 'text-muted-foreground',
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
    );
}
