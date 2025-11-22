'use client';

import { Plus, Coins, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function CreateTokenDropdown() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Token
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <Link href="/create/stablecoin">
                        <Coins className="h-4 w-4 mr-2" />
                        Stablecoin
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/create/arcade-token">
                        <Coins className="h-4 w-4 mr-2" />
                        Arcade Token
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/create/tokenized-security">
                        <Coins className="h-4 w-4 mr-2" />
                        Tokenized Security
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/import">
                        <Upload className="h-4 w-4 mr-2" />
                        Import Existing Token
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

