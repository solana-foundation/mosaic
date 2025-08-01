import {
  type UiWallet,
  type UiWalletAccount,
  uiWalletAccountsAreSame,
  useConnect,
  useDisconnect,
} from '@wallet-standard/react';
import { useCallback, useContext } from 'react';

import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { WalletMenuItemContent } from './WalletMenuItemContent';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, LogOut, User } from 'lucide-react';

type Props = Readonly<{
  onAccountSelect(account: UiWalletAccount | undefined): void;
  onDisconnect(wallet: UiWallet): void;
  onError(err: unknown): void;
  wallet: UiWallet;
}>;

export function ConnectWalletMenuItem({
  onAccountSelect,
  onDisconnect,
  onError,
  wallet,
}: Props) {
  const [isConnecting, connect] = useConnect(wallet);
  const [isDisconnecting, disconnect] = useDisconnect(wallet);
  const isPending = isConnecting || isDisconnecting;
  const isConnected = wallet.accounts.length > 0;
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const handleConnectClick = useCallback(async () => {
    try {
      const existingAccounts = [...wallet.accounts];
      const nextAccounts = await connect();
      // Try to choose the first never-before-seen account.
      for (const nextAccount of nextAccounts) {
        if (
          !existingAccounts.some(existingAccount =>
            uiWalletAccountsAreSame(nextAccount, existingAccount)
          )
        ) {
          onAccountSelect(nextAccount);
          return;
        }
      }
      // Failing that, choose the first account in the list.
      if (nextAccounts[0]) {
        onAccountSelect(nextAccounts[0]);
      }
    } catch (e) {
      onError(e);
    }
  }, [connect, onAccountSelect, onError, wallet.accounts]);
  return (
    <DropdownMenuSub open={!isConnected ? false : undefined}>
      <DropdownMenuSubTrigger
        className="flex items-center justify-between w-full px-2 py-2 text-sm rounded-md hover:bg-accent focus:bg-accent data-[disabled]:opacity-50"
        disabled={isPending}
        onClick={!isConnected ? handleConnectClick : undefined}
      >
        <WalletMenuItemContent loading={isPending} wallet={wallet} />
        {!isConnected && (
          <span className="text-xs text-muted-foreground">
            Click to connect
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5">
          <User className="h-4 w-4" />
          <span>Accounts ({wallet.accounts.length})</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedWalletAccount?.address}>
          {wallet.accounts.map(account => (
            <DropdownMenuRadioItem
              key={account.address}
              value={account.address}
              className="px-4 py-2"
              onSelect={() => {
                onAccountSelect(account);
              }}
            >
              <span className="font-mono text-sm ml-2">
                {account.address.slice(0, 8)}...{account.address.slice(-4)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center gap-2 px-3 py-2"
          onSelect={async e => {
            e.preventDefault();
            await handleConnectClick();
          }}
        >
          <Plus className="h-4 w-4" />
          <span>Connect More</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2 px-3 py-2 text-destructive focus:text-destructive"
          onSelect={async e => {
            e.preventDefault();
            try {
              await disconnect();
              onDisconnect(wallet);
            } catch (e) {
              onError(e);
            }
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
