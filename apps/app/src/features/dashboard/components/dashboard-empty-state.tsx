'use client';

import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardEmptyStateProps {
    onCreateClick: () => void;
    onImportClick: () => void;
}

export function DashboardEmptyState({ onCreateClick, onImportClick }: DashboardEmptyStateProps) {
    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-6xl w-full flex flex-col items-center gap-4">
                <button
                    type="button"
                    aria-label="Create Token"
                    className="h-96 w-full flex flex-col justify-center items-center bg-transparent rounded-[24px] border-dashed border border-primary/10 shadow-sm hover:shadow-none shadow-none transition-all duration-200 cursor-pointer group"
                    onClick={onCreateClick}
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
                </button>
                {/* A wallet with no tokens in this browser still needs a way to reach mints it already has on-chain. */}
                <Button variant="outline" onClick={onImportClick}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import existing token
                </Button>
            </div>
        </div>
    );
}
