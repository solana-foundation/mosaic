'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';
import { useRpcStore } from '@/stores/rpc-store';
import { BUILTIN_CLUSTERS, getConfiguredNetwork } from '@/lib/solana/network';

export function Providers({ children }: { children: ReactNode }) {
    const customRpcs = useRpcStore(state => state.customRpcs);

    const connectorConfig = useMemo(() => {
        // Optional RPC override applied to whichever cluster is selected. When set,
        // it replaces the public endpoint for every network so writes go through the
        // configured provider (the public endpoints are rate-limited and may reject
        // browser writes with HTTP 403).
        const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

        const label = (name: string) => (envRpcUrl ? `${name} (Env RPC)` : name);

        // Base clusters - always available. The list itself lives in
        // lib/solana/network.ts so the network picker sees the same one; only the
        // env RPC override is applied here, to every network (see above).
        const baseClusters = BUILTIN_CLUSTERS.map(cluster => ({
            ...cluster,
            label: label(cluster.label),
            url: envRpcUrl || cluster.url,
        }));

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
