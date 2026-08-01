'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImportTokenModal } from './import-token-modal';
import { IconPlus } from 'symbols-react';
import { Upload } from 'lucide-react';

interface CreateTokenButtonProps {
    onCreateClick: () => void;
    onTokenImported: () => void;
}

export function CreateTokenButton({ onCreateClick, onTokenImported }: CreateTokenButtonProps) {
    const [isImportOpen, setIsImportOpen] = useState(false);

    return (
        <>
            <div className="flex items-center gap-2">
                <Button onClick={onCreateClick} size="sm" className="gap-2">
                    <IconPlus className="size-3 fill-primary/50" />
                    Create
                </Button>
                <Button onClick={() => setIsImportOpen(true)} size="icon">
                    <Upload className="h-3 w-3" />
                </Button>
            </div>

            <ImportTokenModal isOpen={isImportOpen} onOpenChange={setIsImportOpen} onTokenImported={onTokenImported} />
        </>
    );
}
