'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';
import { useRpcStore } from '@/stores/rpc-store';

export function Providers({ children }: { children: ReactNode }) {
    const customRpcs = useRpcStore(state => state.customRpcs);

    const connectorConfig = useMemo(() => {
        // Get custom RPC URL from environment variable
        const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

        // Base clusters - always available
        const baseClusters = [
            {
                id: 'solana:mainnet' as const,
                label: envRpcUrl ? 'Mainnet (Env RPC)' : 'Mainnet',
                name: 'mainnet-beta' as const,
                url: envRpcUrl || 'https://api.mainnet-beta.solana.com',
            },
            {
                id: 'solana:devnet' as const,
                label: 'Devnet',
                name: 'devnet' as const,
                url: 'https://api.devnet.solana.com',
            },
            {
                id: 'solana:testnet' as const,
                label: 'Testnet',
                name: 'testnet' as const,
                url: 'https://api.testnet.solana.com',
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
