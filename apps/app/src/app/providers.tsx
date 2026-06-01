'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';
import { useRpcStore } from '@/stores/rpc-store';

function getEnvRpcNetwork(url?: string): 'mainnet-beta' | 'devnet' | 'testnet' | undefined {
    if (!url) return undefined;

    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes('devnet')) return 'devnet';
    if (normalizedUrl.includes('testnet')) return 'testnet';
    if (normalizedUrl.includes('mainnet')) return 'mainnet-beta';

    return undefined;
}

function getClusterStorageKey(
    envRpcUrl?: string,
    envRpcNetwork?: 'mainnet-beta' | 'devnet' | 'testnet',
): string | undefined {
    if (!envRpcUrl || !envRpcNetwork) return undefined;

    try {
        return `mosaic_rpc_cluster_${envRpcNetwork}_${new URL(envRpcUrl).host}`;
    } catch {
        return `mosaic_rpc_cluster_${envRpcNetwork}`;
    }
}

export function Providers({ children }: { children: ReactNode }) {
    const customRpcs = useRpcStore(state => state.customRpcs);

    const connectorConfig = useMemo(() => {
        // Get custom RPC URL from environment variable
        const envRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const envRpcNetwork = getEnvRpcNetwork(envRpcUrl) ?? 'mainnet-beta';

        const getClusterUrl = (network: 'mainnet-beta' | 'devnet' | 'testnet', fallbackUrl: string) =>
            envRpcUrl && envRpcNetwork === network ? envRpcUrl : fallbackUrl;

        const getClusterLabel = (network: 'mainnet-beta' | 'devnet' | 'testnet', label: string) =>
            envRpcUrl && envRpcNetwork === network ? `${label} (Env RPC)` : label;

        // Base clusters - always available
        const baseClusters = [
            {
                id: 'solana:mainnet' as const,
                label: getClusterLabel('mainnet-beta', 'Mainnet'),
                name: 'mainnet-beta' as const,
                url: getClusterUrl('mainnet-beta', 'https://api.mainnet-beta.solana.com'),
            },
            {
                id: 'solana:devnet' as const,
                label: getClusterLabel('devnet', 'Devnet'),
                name: 'devnet' as const,
                url: getClusterUrl('devnet', 'https://api.devnet.solana.com'),
            },
            {
                id: 'solana:testnet' as const,
                label: getClusterLabel('testnet', 'Testnet'),
                name: 'testnet' as const,
                url: getClusterUrl('testnet', 'https://api.testnet.solana.com'),
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
            network: envRpcNetwork,
            clusterStorageKey: getClusterStorageKey(envRpcUrl, envRpcNetwork),
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
                network: getEnvRpcNetwork(process.env.NEXT_PUBLIC_SOLANA_RPC_URL),
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
