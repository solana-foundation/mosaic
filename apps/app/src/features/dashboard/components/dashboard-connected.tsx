'use client';

import { useState } from 'react';
import { TokenCard } from './token-card';
import { TokenCardEmptyState } from './token-card-empty-state';
import { CreateTokenButton } from './create-token-button';
import { DashboardEmptyState } from './dashboard-empty-state';
import { ImportTokenModal } from './import-token-modal';
import { CreateTokenModal } from '@/features/token-creation/components/create-token-modal';
import { IconCircleDottedAndCircle } from 'symbols-react';
import { useConnector } from '@solana/connector/react';
import { useWalletTokens, useTokenStore } from '@/stores/token-store';

export function DashboardConnected() {
    const { selectedAccount } = useConnector();
    const tokens = useWalletTokens(selectedAccount || undefined);
    const removeToken = useTokenStore(state => state.removeToken);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);

    const handleDeleteToken = (address: string) => {
        removeToken(address);
    };

    const openCreateModal = () => setIsCreateOpen(true);
    const openImportModal = () => setIsImportOpen(true);

    // The create and import modals are owned here, as siblings of the token list, so that
    // adding the first token — which swaps the empty state for the grid — cannot unmount
    // either one out from under its success screen.
    return (
        <>
            {tokens.length === 0 ? (
                <DashboardEmptyState onCreateClick={openCreateModal} onImportClick={openImportModal} />
            ) : (
                <div className="flex-1 p-8">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2 justify-center">
                                <IconCircleDottedAndCircle className="size-6 fill-primary/30" />
                                <h2 className="font-diatype-bold text-xl text-primary">Token Manager</h2>
                            </div>
                            <CreateTokenButton onCreateClick={openCreateModal} onImportClick={openImportModal} />
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
            <ImportTokenModal isOpen={isImportOpen} onOpenChange={setIsImportOpen} />
        </>
    );
}
