'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

const DEFAULT_FEATURES = [
    {
        name: 'Metadata',
        description: 'Token name, symbol, and URI stored on-chain',
    },
    {
        name: 'Pausable',
        description: 'Ability to pause token transfers',
    },
    {
        // The template sets `withDefaultAccountState(!useSrfc37)`, and sRFC-37 is not
        // configurable from this form, so new accounts start Initialized. The previous copy
        // ("start frozen until added to allowlist") described behaviour the form can't produce.
        name: 'Default Account State',
        description: 'New accounts start active and can be frozen individually',
    },
    {
        name: 'Permanent Delegate',
        description: 'Authority can transfer/burn tokens from any account',
    },
];

export function ArcadeTokenFeaturesStep() {
    return (
        <Card className="py-4 rounded-3xl">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div>
                        <CardTitle className="text-base">Enabled Features</CardTitle>
                        <CardDescription className="text-xs">
                            Arcade tokens come pre-configured for closed-loop systems
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {DEFAULT_FEATURES.map(feature => (
                        <div key={feature.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                            <div className="mt-0.5 p-1 rounded-full bg-primary/10">
                                <Check className="w-3 h-3 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">{feature.name}</p>
                                <p className="text-xs text-muted-foreground">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
