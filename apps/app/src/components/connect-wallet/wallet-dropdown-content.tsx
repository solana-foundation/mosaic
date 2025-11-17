'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Wallet, Copy, Globe } from 'lucide-react';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { useState } from 'react';

interface WalletDropdownContentProps {
    selectedAccount: string;
    walletIcon?: string;
    walletName: string;
    onDisconnect: () => void;
}

export function WalletDropdownContent({
    selectedAccount,
    walletIcon,
    walletName,
    onDisconnect,
}: WalletDropdownContentProps) {
    const { balance, isLoading } = useWalletBalance();
    const [copied, setCopied] = useState(false);

    const shortAddress = `${selectedAccount.slice(0, 4)}...${selectedAccount.slice(-4)}`;

    function handleCopy() {
        navigator.clipboard.writeText(selectedAccount);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleOpenExplorer() {
        window.open(`https://solscan.io/account/${selectedAccount}`, '_blank');
    }

    return (
        <div className="w-[320px] p-4 space-y-4">
            {/* Header with Avatar and Address */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                        {walletIcon && <AvatarImage src={walletIcon} alt={walletName} />}
                        <AvatarFallback>
                            <Wallet className="h-6 w-6" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="font-semibold text-lg">{shortAddress}</div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="rounded-full bg-muted p-2 hover:bg-accent transition-colors"
                        title={copied ? 'Copied!' : 'Copy address'}
                    >
                        <Copy className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenExplorer}
                        className="rounded-full bg-muted p-2 hover:bg-accent transition-colors"
                        title="View on explorer"
                    >
                        <Globe className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Balance Section */}
            <div className="rounded-[12px] border bg-muted/50 p-4">
                <div className="text-sm text-muted-foreground mb-1">Balance</div>
                <div className="text-2xl font-bold">
                    {isLoading ? (
                        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
                    ) : balance !== null ? (
                        `${balance.toFixed(1)} SOL`
                    ) : (
                        '-- SOL'
                    )}
                </div>
            </div>

            {/* Disconnect Button */}
            <Button
                variant="default"
                className="w-full h-12 text-base rounded-[12px]"
                onClick={onDisconnect}
            >
                Disconnect
            </Button>
        </div>
    );
}

