'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { templates } from './templates';

export function DashboardEmptyState() {
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

                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-2xl">Choose a Template</DialogTitle>
                            <DialogDescription>
                                Select the type of token you want to create
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-3 mt-4">
                            {templates.map((template) => {
                                const Icon = template.icon;
                                return (
                                    <Link
                                        key={template.href}
                                        href={template.href}
                                        onClick={() => setIsCreateModalOpen(false)}
                                        className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors group"
                                    >
                                        <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                                            <Icon className="h-6 w-6 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-semibold mb-1">{template.title}</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {template.description}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

