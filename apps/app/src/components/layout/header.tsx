'use client';
import { ModeToggle } from '@/components/mode-toggle';

import Link from 'next/link';
import { ConnectButton } from '@/features/wallet/components/connect-button';
import { Logo } from '@/components/logo';

export function Header() {
    return (
        <header suppressHydrationWarning className="sticky px-4 xl:px-0 top-0 z-50 w-full border-b bg-bg1 dark:bg-background backdrop-blur">
            <div className="max-w-6xl mx-auto flex h-20 items-center justify-between">
                <Link className="flex items-center space-x-2" href={'/'}>
                    <Logo className="text-foreground" width={24} height={24} />
                </Link>
                <div className="flex items-center space-x-4">
                    <ConnectButton />
                    <ModeToggle />
                </div>
            </div>
        </header>
    );
}
