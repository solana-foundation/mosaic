'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Globe, ChevronLeft, Plus, Check, X } from 'lucide-react';
import { useWalletBalance } from '@/features/wallet/hooks/use-wallet-balance';
import { useState, useMemo } from 'react';
import { useCluster } from '@solana/connector/react';
import { motion } from 'motion/react';
import { CopyButton } from '@/components/ui/copy-button';
import { useRpcStore, type NetworkName } from '@/stores/rpc-store';

interface WalletDropdownContentProps {
    selectedAccount: string;
    walletIcon?: string;
    walletName: string;
    onDisconnect: () => void;
}

type DropdownView = 'wallet' | 'network';

interface NetworkOption {
    id: string;
    label: string;
    name: NetworkName;
    isCustom?: boolean;
}

const DEFAULT_NETWORKS: NetworkOption[] = [
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
    const [view, setView] = useState<DropdownView>('wallet');
    const { cluster, setCluster } = useCluster();
    const { customRpcs, addCustomRpc, removeCustomRpc } = useRpcStore();

    // Inline add RPC form state
    const [isAddingRpc, setIsAddingRpc] = useState(false);
    const [newRpcLabel, setNewRpcLabel] = useState('');
    const [newRpcUrl, setNewRpcUrl] = useState('');
    const [newRpcNetwork, setNewRpcNetwork] = useState<NetworkName>('mainnet-beta');

    const shortAddress = `${selectedAccount.slice(0, 4)}...${selectedAccount.slice(-4)}`;

    // Get current cluster id for selection
    const currentClusterId = (cluster as { id?: string })?.id || 'solana:mainnet';

    // Build all networks list (default + custom)
    const allNetworks = useMemo<NetworkOption[]>(() => {
        const customNetworks = customRpcs.map(rpc => ({
            id: rpc.id,
            label: rpc.label,
            name: rpc.network,
            isCustom: true,
        }));
        return [...DEFAULT_NETWORKS, ...customNetworks];
    }, [customRpcs]);

    async function handleNetworkSwitch(networkId: string) {
        await setCluster(networkId as `solana:${string}`);
    }

    function handleRemoveCustomRpc(e: React.MouseEvent, rpcId: string) {
        e.stopPropagation();
        removeCustomRpc(rpcId);
    }

    function handleAddRpc() {
        if (!newRpcLabel.trim() || !newRpcUrl.trim()) return;

        addCustomRpc({
            label: newRpcLabel.trim(),
            url: newRpcUrl.trim(),
            network: newRpcNetwork,
        });

        // Reset form
        setNewRpcLabel('');
        setNewRpcUrl('');
        setNewRpcNetwork('mainnet-beta');
        setIsAddingRpc(false);
    }

    function handleCancelAddRpc() {
        setNewRpcLabel('');
        setNewRpcUrl('');
        setNewRpcNetwork('mainnet-beta');
        setIsAddingRpc(false);
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
                        <CopyButton
                            textToCopy={selectedAccount}
                            iconOnly
                            variant="ghost"
                            className="rounded-full bg-muted hover:bg-accent"
                            iconClassName="h-4 w-4"
                            iconClassNameCheck="h-4 w-4"
                        />
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
                {allNetworks.map((network, index) => {
                    const isSelected = currentClusterId === network.id;
                    return (
                        <div
                            key={network.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleNetworkSwitch(network.id)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleNetworkSwitch(network.id);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors cursor-pointer ${
                                index !== allNetworks.length - 1 ? 'border-b border-border' : ''
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{network.label}</span>
                                {network.isCustom && (
                                    <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                        Custom
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {network.isCustom && (
                                    <button
                                        type="button"
                                        onClick={e => handleRemoveCustomRpc(e, network.id)}
                                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remove custom RPC"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <div
                                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                    }`}
                                >
                                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Inline Add Custom RPC Form */}
            {isAddingRpc ? (
                <div className="space-y-3 rounded-[12px] border bg-muted/50 p-4">
                    <Input
                        placeholder="Label (e.g., Helius Mainnet)"
                        value={newRpcLabel}
                        onChange={e => setNewRpcLabel(e.target.value)}
                        className="h-10"
                    />
                    <Input
                        placeholder="RPC URL"
                        value={newRpcUrl}
                        onChange={e => setNewRpcUrl(e.target.value)}
                        className="h-10"
                    />
                    <Select value={newRpcNetwork} onValueChange={v => setNewRpcNetwork(v as NetworkName)}>
                        <SelectTrigger className="h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="mainnet-beta">Mainnet</SelectItem>
                            <SelectItem value="devnet">Devnet</SelectItem>
                            <SelectItem value="testnet">Testnet</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={handleCancelAddRpc}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="flex-1"
                            onClick={handleAddRpc}
                            disabled={!newRpcLabel.trim() || !newRpcUrl.trim()}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            ) : (
                <Button
                    variant="secondary"
                    className="w-full h-12 text-base rounded-[12px] bg-muted hover:bg-muted/80"
                    onClick={() => setIsAddingRpc(true)}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom RPC
                </Button>
            )}
        </motion.div>
    );
}
