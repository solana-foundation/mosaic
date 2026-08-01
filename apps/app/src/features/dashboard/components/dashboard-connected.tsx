'use client';

import { useState } from 'react';
import { TokenCard } from './token-card';
import { TokenCardEmptyState } from './token-card-empty-state';
import { CreateTokenButton } from './create-token-button';
import { DashboardEmptyState } from './dashboard-empty-state';
import { CreateTokenModal } from '@/features/token-creation/components/create-token-modal';
import { IconCircleDottedAndCircle } from 'symbols-react';
import { useConnector } from '@solana/connector/react';
import { useWalletTokens, useTokenStore } from '@/stores/token-store';

export function DashboardConnected() {
    const { selectedAccount } = useConnector();
    const tokens = useWalletTokens(selectedAccount || undefined);
    const removeToken = useTokenStore(state => state.removeToken);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const handleDeleteToken = (address: string) => {
        removeToken(address);
    };

    const handleTokenImported = () => {
        // No-op: tokens will automatically update via reactive store
    };

    const openCreateModal = () => setIsCreateOpen(true);

    // The create modal is owned here, as a sibling of the token list, so that adding the
    // first token — which swaps the empty state for the grid — cannot unmount the wizard
    // out from under its success screen.
    return (
        <>
            {tokens.length === 0 ? (
                <DashboardEmptyState onCreateClick={openCreateModal} />
            ) : (
                <div className="flex-1 p-8">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2 justify-center">
                                <IconCircleDottedAndCircle className="size-6 fill-primary/30" />
                                <h2 className="font-diatype-bold text-xl text-primary">Token Manager</h2>
                            </div>
                            <CreateTokenButton onCreateClick={openCreateModal} onTokenImported={handleTokenImported} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {tokens.map(token => (
                                <TokenCard key={token.address} token={token} onDelete={handleDeleteToken} />
                            ))}
                            <TokenCardEmptyState onCreateClick={openCreateModal} />
                        </div>
                    </div>
                </div>
            )}

            <CreateTokenModal isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} />
        </>
    );
}
