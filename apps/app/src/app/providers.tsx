'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';
import { useRpcStore } from '@/stores/rpc-store';

export function Providers({ children }: { children: ReactNode }) {
    const customRpcs = useRpcStore(state => state.customRpcs);

    const connectorConfig = useMemo(() => {
        // Optional RPC override applied to whichever cluster is selected. When set,
        // it replaces the public endpoint for every network so writes go through the
        // configured provider (the public endpoints are rate-limited and may reject
        // browser writes with HTTP 403).
        const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

        const label = (name: string) => (envRpcUrl ? `${name} (Env RPC)` : name);

        // Base clusters - always available
        const baseClusters = [
            {
                id: 'solana:mainnet' as const,
                label: label('Mainnet'),
                name: 'mainnet-beta' as const,
                url: envRpcUrl || 'https://api.mainnet-beta.solana.com',
            },
            {
                id: 'solana:devnet' as const,
                label: label('Devnet'),
                name: 'devnet' as const,
                url: envRpcUrl || 'https://api.devnet.solana.com',
            },
            {
                id: 'solana:testnet' as const,
                label: label('Testnet'),
                name: 'testnet' as const,
                url: envRpcUrl || 'https://api.testnet.solana.com',
            },
        ];

        // Add user-defined custom RPCs
        const userClusters = customRpcs.map(rpc => ({
            id: rpc.id as `solana:${string}`,
            label: rpc.label,
            name: rpc.network,
            url: rpc.url,
        }));

        const clusters = [...baseClusters, ...userClusters];

        return getDefaultConfig({
            appName: 'Mosaic - Tokenization Engine',
            appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            autoConnect: true,
            enableMobile: true,
            clusters,
            // Only applies on a first visit: the connector persists the user's
            // choice under `connector-kit:cluster` and prefers it over this.
            // Without it the connector falls back to mainnet, where creating a
            // token would spend real SOL.
            network: 'devnet',
        });
    }, [customRpcs]);

    const mobile = useMemo(
        () =>
            getDefaultMobileConfig({
                appName: 'Mosaic - Tokenization Engine',
                appUrl:
                    process.env.NEXT_PUBLIC_MOBILE_APP_URL ||
                    process.env.NEXT_PUBLIC_APP_URL ||
                    'http://localhost:3000',
            }),
        [],
    );

    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
                {children}
            </AppProvider>
        </ThemeProvider>
    );
}
