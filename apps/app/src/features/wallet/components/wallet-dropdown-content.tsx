'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Wallet, Copy, Globe, ChevronLeft, Plus, Check } from 'lucide-react';
import { useWalletBalance } from '@/features/wallet/hooks/use-wallet-balance';
import { useState } from 'react';
import { useCluster } from '@solana/connector/react';
import { motion } from 'motion/react';

interface WalletDropdownContentProps {
    selectedAccount: string;
    walletIcon?: string;
    walletName: string;
    onDisconnect: () => void;
}

type DropdownView = 'wallet' | 'network';

interface NetworkOption {
    id: `solana:${string}`;
    label: string;
    name: 'mainnet-beta' | 'devnet' | 'testnet';
}

const NETWORKS: NetworkOption[] = [
    { id: 'solana:mainnet', label: 'Mainnet', name: 'mainnet-beta' },
    { id: 'solana:devnet', label: 'Devnet', name: 'devnet' },
    { id: 'solana:testnet', label: 'Testnet', name: 'testnet' },
];

export function WalletDropdownContent({
    selectedAccount,
    walletIcon,
    walletName,
    onDisconnect,
}: WalletDropdownContentProps) {
    const { balance, isLoading } = useWalletBalance();
    const [copied, setCopied] = useState(false);
    const [view, setView] = useState<DropdownView>('wallet');
    const { cluster, setCluster } = useCluster();

    const shortAddress = `${selectedAccount.slice(0, 4)}...${selectedAccount.slice(-4)}`;

    // Get current cluster name
    const currentClusterName = (cluster as { name?: string })?.name || 'mainnet-beta';

    function handleCopy() {
        navigator.clipboard.writeText(selectedAccount);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleNetworkSwitch(network: NetworkOption) {
        await setCluster(network.id);
    }

    // Wallet View
    if (view === 'wallet') {
        return (
            <motion.div
                key="wallet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-[320px] p-4 space-y-4"
            >
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
                            onClick={() => setView('network')}
                            className="rounded-full bg-muted p-2 hover:bg-accent transition-colors"
                            title="Network Settings"
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
                <Button variant="default" className="w-full h-12 text-base rounded-[12px]" onClick={onDisconnect}>
                    Disconnect
                </Button>
            </motion.div>
        );
    }

    // Network Settings View
    return (
        <motion.div
            key="network"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-[320px] p-4 space-y-4"
        >
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setView('wallet')}
                    className="rounded-full border border-border p-2 hover:bg-accent transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <Globe className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold text-lg">Network Settings</span>
            </div>

            {/* Network Options */}
            <div className="rounded-[12px] border bg-muted/50 overflow-hidden">
                {NETWORKS.map((network, index) => {
                    const isSelected = currentClusterName === network.name;
                    return (
                        <button
                            key={network.id}
                            type="button"
                            onClick={() => handleNetworkSwitch(network)}
                            className={`w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors ${
                                index !== NETWORKS.length - 1 ? 'border-b border-border' : ''
                            }`}
                        >
                            <span className="font-medium">{network.label}</span>
                            <div
                                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                }`}
                            >
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Add Custom RPC Button */}
            <Button
                variant="secondary"
                className="w-full h-12 text-base rounded-[12px] bg-muted hover:bg-muted/80"
                onClick={() => {
                    // TODO: Implement custom RPC modal
                }}
            >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom RPC
            </Button>
        </motion.div>
    );
}
