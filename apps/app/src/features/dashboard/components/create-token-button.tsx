'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateTokenModal } from '@/features/token-creation/components/create-token-modal';
import { ImportTokenModal } from './import-token-modal';
import { IconPlus } from 'symbols-react';
import { Upload } from 'lucide-react';

interface CreateTokenButtonProps {
    onTokenCreated?: () => void;
}

export function CreateTokenButton({ onTokenCreated }: CreateTokenButtonProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);

    const handleTokenCreated = () => {
        onTokenCreated?.();
    };

    const handleTokenImported = () => {
        onTokenCreated?.();
    };

    return (
        <>
            <div className="flex items-center gap-2">
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-2">
                    <IconPlus className="size-3 fill-primary/50" />
                    Create
                </Button>
                <Button onClick={() => setIsImportOpen(true)} size="icon">
                    <Upload className="h-3 w-3" />
                </Button>
            </div>

            <CreateTokenModal
                isOpen={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onTokenCreated={handleTokenCreated}
            />
            <ImportTokenModal
                isOpen={isImportOpen}
                onOpenChange={setIsImportOpen}
                onTokenImported={handleTokenImported}
            />
        </>
    );
}
