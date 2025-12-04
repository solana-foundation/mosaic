'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateTokenModal } from '@/features/token-creation/components/create-token-modal';
import { Card, CardContent } from '@/components/ui/card';

interface TokenCardEmptyStateProps {
    onTokenCreated?: () => void;
}

export function TokenCardEmptyState({ onTokenCreated }: TokenCardEmptyStateProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <>
            <Card
                className="h-full flex flex-col bg-transparent rounded-[24px] border-dashed border border-primary/10 shadow-sm hover:shadow-none shadow-none transition-all duration-200 cursor-pointer group"
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                    backgroundImage: `repeating-linear-gradient(
                      45deg,
                      transparent,
                      transparent 10px,
                      var(--diagonal-pattern-color) 10px,
                      var(--diagonal-pattern-color) 11px
                    )`,
                }}
            >
                <CardContent className="group p-6 flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-center">
                        <div className="rounded-2xl bg-primary/5 backdrop-blur-sm p-3 group-hover:opacity-70 transition-all duration-200 ease-in-out">
                            <Plus className="h-10 w-10 text-muted-foreground group-hover:rotate-90 group-active:scale-[0.90] transition-all duration-200 ease-in-out" />
                        </div>
                        <div>
                            <h3 className="text-xl text-muted-foreground group-hover:text-primary transition-all duration-200 ease-in-out font-semibold mb-1">
                                Create Token
                            </h3>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <CreateTokenModal
                isOpen={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
                onTokenCreated={onTokenCreated}
            />
        </>
    );
}
