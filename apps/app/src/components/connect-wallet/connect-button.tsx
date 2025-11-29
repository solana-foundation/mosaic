'use client';

import { useConnector } from '@solana/connector/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useState } from 'react';
import { motion } from 'motion/react';
import { WalletModal } from './wallet-modal';
import { WalletDropdownContent } from './wallet-dropdown-content';
import { Wallet, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectButtonProps {
    className?: string;
}

export function ConnectButton({ className }: ConnectButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const connector = useConnector();
    const { connected, connecting, selectedWallet, selectedAccount, disconnect, wallets } = connector;

    if (connecting) {
        return (
            <Button size="sm" disabled className={className}>
                <div className=" h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </Button>
        );
    }

    if (connected && selectedAccount && selectedWallet) {
        const shortAddress = `${selectedAccount.slice(0, 4)}...${selectedAccount.slice(-4)}`;

        // Get wallet icon from wallets list (has proper icons) or fallback to selectedWallet
        const walletWithIcon = wallets.find(w => w.wallet.name === selectedWallet.name);
        const walletIcon = walletWithIcon?.wallet.icon || selectedWallet.icon;

        return (
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild>
                    <Button variant="default" size="sm" className={cn("pr-2", className)}>
                        <Avatar className="h-5 w-5">
                            {walletIcon && <AvatarImage src={walletIcon} alt={selectedWallet.name} />}
                            <AvatarFallback>
                                <Wallet className="h-3 w-3" />
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{shortAddress}</span>
                        <motion.div
                            animate={{ rotate: isDropdownOpen ? -180 : 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                        >
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </motion.div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="p-0 rounded-[20px]">
                    <WalletDropdownContent
                        selectedAccount={selectedAccount}
                        walletIcon={walletIcon}
                        walletName={selectedWallet.name}
                        onDisconnect={() => disconnect()}
                    />
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <>
            <Button size="sm" onClick={() => setIsModalOpen(true)} className={className}>
                Connect Wallet
            </Button>
            <WalletModal open={isModalOpen} onOpenChange={setIsModalOpen} />
        </>
    );
}
