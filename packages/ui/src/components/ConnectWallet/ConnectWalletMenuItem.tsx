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
import { ChevronRightIcon } from 'lucide-react';

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
        asChild={false}
        className={[
          'rt-BaseMenuItem',
          'rt-BaseMenuSubTrigger',
          'rt-DropdownMenuItem',
          'rt-DropdownMenuSubTrigger',
        ].join(' ')}
        disabled={isPending}
        onClick={!isConnected ? handleConnectClick : undefined}
      >
        <WalletMenuItemContent loading={isPending} wallet={wallet} />
        {isConnected ? (
          <div className="rt-BaseMenuShortcut rt-DropdownMenuShortcut">
            <ChevronRightIcon />
          </div>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedWalletAccount?.address}>
          {wallet.accounts.map(account => (
            <DropdownMenuRadioItem
              key={account.address}
              value={account.address}
              onSelect={() => {
                onAccountSelect(account);
              }}
            >
              {account.address.slice(0, 8)}&hellip;
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async e => {
            e.preventDefault();
            await handleConnectClick();
          }}
        >
          Connect More
        </DropdownMenuItem>
        <DropdownMenuItem
          color="red"
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
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
