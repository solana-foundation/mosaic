'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateTokenModal } from './create-token-modal';
import { IconPlus } from 'symbols-react';

interface CreateTokenButtonProps {
    onTokenCreated?: () => void;
}

export function CreateTokenButton({ onTokenCreated }: CreateTokenButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Button onClick={() => setIsOpen(true)} size="sm" className="gap-2">
                <IconPlus className="size-3 fill-primary/50" />
                Create
            </Button>

            <CreateTokenModal isOpen={isOpen} onOpenChange={setIsOpen} onTokenCreated={onTokenCreated} />
        </>
    );
}

