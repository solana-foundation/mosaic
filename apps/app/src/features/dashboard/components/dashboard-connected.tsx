'use client';

import { TokenCard } from './token-card';
import { TokenCardEmptyState } from './token-card-empty-state';
import { CreateTokenButton } from './create-token-button';
import { DashboardEmptyState } from './dashboard-empty-state';
import { IconCircleDottedAndCircle } from 'symbols-react';
import { useConnector } from '@solana/connector/react';
import { useWalletTokens, useTokenStore } from '@/stores/token-store';

export function DashboardConnected() {
    const { selectedAccount } = useConnector();
    const tokens = useWalletTokens(selectedAccount || undefined);
    const removeToken = useTokenStore(state => state.removeToken);

    const handleDeleteToken = (address: string) => {
        removeToken(address);
    };

    const handleTokenCreated = () => {
        // No-op: tokens will automatically update via reactive store
    };

    if (tokens.length === 0) {
        return <DashboardEmptyState onTokenCreated={handleTokenCreated} />;
    }

    return (
        <div className="flex-1 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2 justify-center">
                        <IconCircleDottedAndCircle className="size-6 fill-primary/30" />
                        <h2 className="font-diatype-bold text-xl text-primary">Token Manager</h2>
                    </div>
                    <CreateTokenButton onTokenCreated={handleTokenCreated} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tokens.map(token => (
                        <TokenCard key={token.address} token={token} onDelete={handleDeleteToken} />
                    ))}
                    <TokenCardEmptyState onTokenCreated={handleTokenCreated} />
                </div>
            </div>
        </div>
    );
}
