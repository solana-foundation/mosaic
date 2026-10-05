'use client';

import { Button } from '@/components/ui/button';
import { IconPlus } from 'symbols-react';
import { Upload } from 'lucide-react';

interface CreateTokenButtonProps {
    onCreateClick: () => void;
    onImportClick: () => void;
}

export function CreateTokenButton({ onCreateClick, onImportClick }: CreateTokenButtonProps) {
    return (
        <div className="flex items-center gap-2">
            <Button onClick={onCreateClick} size="sm" className="gap-2">
                <IconPlus className="size-3 fill-primary/50" />
                Create
            </Button>
            <Button onClick={onImportClick} size="icon" aria-label="Import token" title="Import token">
                <Upload className="h-3 w-3" />
            </Button>
        </div>
    );
}
