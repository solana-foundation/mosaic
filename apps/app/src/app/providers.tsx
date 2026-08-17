'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';
import { useRpcStore } from '@/stores/rpc-store';
import { getConfiguredNetwork } from '@/lib/solana/network';

export function Providers({ children }: { children: ReactNode }) {
    const customRpcs = useRpcStore(state => state.customRpcs);

    const connectorConfig = useMemo(() => {
        // Get custom RPC URL from environment variable
        const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

        // Base clusters - always available.
        // Devnet is listed first so that a stale persisted cluster id (e.g. a custom
        // RPC the user later deleted) falls back to Devnet rather than Mainnet:
        // ClusterManager resolves an unknown stored id to clusters[0].
        const baseClusters = [
            {
                id: 'solana:devnet' as const,
                label: 'Devnet',
                name: 'devnet' as const,
                url: 'https://api.devnet.solana.com',
            },
            {
                id: 'solana:mainnet' as const,
                label: envRpcUrl ? 'Mainnet (Env RPC)' : 'Mainnet',
                name: 'mainnet-beta' as const,
                url: envRpcUrl || 'https://api.mainnet-beta.solana.com',
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
            // Cluster the app boots into when the user has never picked one.
            // This is what makes a first visit land on Devnet: it becomes the
            // `initial` value of the connector's cluster storage.
            network: getConfiguredNetwork(),
            // Default, but stated explicitly: it is what persists an explicit
            // user choice across reloads.
            persistClusterSelection: true,
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
                // Without this, mobile wallet adapter sessions authorize against
                // mainnet while the desktop UI reports Devnet.
                network: getConfiguredNetwork(),
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
