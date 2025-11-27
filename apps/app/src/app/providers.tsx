'use client';

import { useMemo, type ReactNode } from 'react';
import { AppProvider } from '@solana/connector/react';
import { getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ThemeProvider } from '@/components/theme-provider';

export function Providers({ children }: { children: ReactNode }) {
    const connectorConfig = useMemo(() => {
        // Get custom RPC URL from environment variable
        const customRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

        // If custom RPC is provided, create custom cluster configuration
        const clusters = customRpcUrl
            ? [
                  {
                      id: 'solana:mainnet' as const,
                      label: 'Mainnet (Custom RPC)',
                      name: 'mainnet-beta' as const,
                      url: customRpcUrl,
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
              ]
            : undefined;

        return getDefaultConfig({
            appName: 'Mosaic - Tokenization Engine',
            appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            autoConnect: true,
            enableMobile: true,
            // Pass custom clusters if RPC URL is provided
            clusters,
        });
    }, []);

    const mobile = useMemo(
        () =>
            getDefaultMobileConfig({
                appName: 'Mosaic - Tokenization Engine',
                appUrl: process.env.NEXT_PUBLIC_MOBILE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
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
