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
        name: 'Default Account State (Allowlist)',
        description: 'New accounts start frozen until added to allowlist',
    },
    {
        name: 'Permanent Delegate',
        description: 'Authority can transfer/burn tokens from any account',
    },
];

export function ArcadeTokenFeaturesStep() {
    return (
        <Card className="py-4">
            <CardHeader>
                <CardTitle>Enabled Features</CardTitle>
                <CardDescription>
                    Arcade tokens come pre-configured with the following features for closed-loop systems.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {DEFAULT_FEATURES.map(feature => (
                        <div
                            key={feature.name}
                            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                        >
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
