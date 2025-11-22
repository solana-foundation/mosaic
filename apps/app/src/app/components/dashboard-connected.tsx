'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { getAllTokens } from '@/lib/token/token-data';
import { TokenStorage } from '@/lib/token/token-storage';
import { TokenDisplay } from '@/types/token';
import { TokenCard } from './token-card';
import { CreateTokenButton } from './create-token-button';
import { DashboardEmptyState } from './dashboard-empty-state';
import { IconCircleDottedAndCircle } from 'symbols-react';

export function DashboardConnected() {
    const [tokens, setTokens] = useState<TokenDisplay[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTokens = () => {
        const storedTokens = getAllTokens();
        setTokens(storedTokens);
        setLoading(false);
    };

    useEffect(() => {
        loadTokens();
    }, []);

    const handleDeleteToken = (address: string) => {
        if (confirm('Are you sure you want to remove this token from your local storage?')) {
            TokenStorage.removeToken(address);
            setTokens(getAllTokens());
        }
    };

    const handleTokenCreated = () => {
        // Refresh the token list when a new token is created
        loadTokens();
    };

    if (loading) {
        return (
            <div className="flex-1 p-8">
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <Spinner size={32} className="mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading your tokens...</p>
                    </div>
                </div>
            </div>
        );
    }

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
                    {tokens.map((token, index) => (
                        <TokenCard key={index} token={token} index={index} onDelete={handleDeleteToken} />
                    ))}
                </div>
            </div>
        </div>
    );
}

