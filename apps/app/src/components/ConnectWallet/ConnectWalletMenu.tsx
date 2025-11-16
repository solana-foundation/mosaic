import { StandardConnect, StandardDisconnect } from '@wallet-standard/core';
import {
    type UiWallet,
    type UiWalletAccount,
    uiWalletAccountBelongsToUiWallet,
    useWallets,
} from '@wallet-standard/react';
import { useContext, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Wallet } from 'lucide-react';

import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { ConnectWalletMenuItem } from './ConnectWalletMenuItem';
import { UnconnectableWalletMenuItem } from './UnconnectableWalletMenuItem';
import { WalletAccountIcon } from './WalletAccountIcon';

type Props = Readonly<{
    children: React.ReactNode;
}>;

type WalletMenuItemProps = {
    wallet: UiWallet;
    error: unknown;
    onAccountSelect: (account: UiWalletAccount) => void;
    onDisconnect: (wallet: UiWallet) => void;
    onError: (error: unknown) => void;
};

function WalletMenuItem({ wallet, error, onAccountSelect, onDisconnect, onError }: WalletMenuItemProps) {
    if (error) {
        return <UnconnectableWalletMenuItem error={error} wallet={wallet} />;
    }
    return (
        <ConnectWalletMenuItem
            onAccountSelect={onAccountSelect}
            onDisconnect={onDisconnect}
            onError={onError}
            wallet={wallet}
        />
    );
}

export function ConnectWalletMenu({ children }: Props) {
    const wallets = useWallets();
    const [selectedWalletAccount, setSelectedWalletAccount] = useContext(SelectedWalletAccountContext);
    const [forceClose, setForceClose] = useState(false);
    const [error, setError] = useState<unknown>();
    const walletsThatSupportStandardConnect = [];
    const unconnectableWallets = [];
    for (const wallet of wallets) {
        if (
            wallet.features.includes(StandardConnect) &&
            wallet.features.includes(StandardDisconnect) &&
            wallet.chains.some(chain => chain.includes('solana'))
        ) {
            walletsThatSupportStandardConnect.push(wallet);
        } else {
            unconnectableWallets.push(wallet);
        }
    }
    return (
        <>
            <DropdownMenu open={forceClose ? false : undefined} onOpenChange={() => setForceClose(false)}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2 px-3 py-2 h-10">
                        {selectedWalletAccount ? (
                            <>
                                <WalletAccountIcon account={selectedWalletAccount} width="20" height="20" />
                                <span className="font-mono text-sm">
                                    {selectedWalletAccount.address.slice(0, 8)}...
                                </span>
                                <ChevronDown className="h-4 w-4 opacity-60" />
                            </>
                        ) : (
                            <>
                                <Wallet className="h-4 w-4" />
                                {children}
                                <ChevronDown className="h-4 w-4 opacity-60" />
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {wallets.length === 0 ? (
                        <div className="p-4 text-center">
                            <Wallet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground font-medium">No wallets found</p>
                            <p className="text-xs text-muted-foreground mt-1">Install a Solana wallet to get started</p>
                        </div>
                    ) : (
                        <div className="p-1">
                            {!selectedWalletAccount && (
                                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b mb-1">
                                    Available Wallets
                                </div>
                            )}
                            {walletsThatSupportStandardConnect.map((wallet, index) => (
                                <WalletMenuItem
                                    key={`${wallet.name}-${index}`}
                                    wallet={wallet}
                                    error={error}
                                    onAccountSelect={account => {
                                        setSelectedWalletAccount(account);
                                        setForceClose(true);
                                    }}
                                    onDisconnect={wallet => {
                                        if (
                                            selectedWalletAccount &&
                                            uiWalletAccountBelongsToUiWallet(selectedWalletAccount, wallet)
                                        ) {
                                            setSelectedWalletAccount(undefined);
                                        }
                                    }}
                                    onError={setError}
                                />
                            ))}
                        </div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
