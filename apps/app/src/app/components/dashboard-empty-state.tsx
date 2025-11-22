'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateTokenModal } from './create-token-modal';

interface DashboardEmptyStateProps {
    onTokenCreated?: () => void;
}

export function DashboardEmptyState({ onTokenCreated }: DashboardEmptyStateProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-6xl w-full">
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="w-full border border-dashed border-muted-foreground/25 rounded-2xl p-16 hover:border-muted-foreground/40 hover:bg-muted/5 transition-all duration-200 group cursor-pointer"
                >
                    <div className="flex flex-col items-center justify-center gap-4">
                        <div className="rounded-2xl bg-primary/5 p-6 group-hover:bg-primary/10 transition-colors">
                            <Plus className="h-12 w-12 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-semibold mb-2">Create Your First Token</h3>
                            <p className="text-muted-foreground">
                                Choose from our templates to get started quickly
                            </p>
                        </div>
                    </div>
                </button>

                <CreateTokenModal isOpen={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} onTokenCreated={onTokenCreated} />
            </div>
        </div>
    );
}
