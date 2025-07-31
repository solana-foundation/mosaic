import { StandardConnect, StandardDisconnect } from '@wallet-standard/core';
import {
  type UiWallet,
  uiWalletAccountBelongsToUiWallet,
  useWallets,
} from '@wallet-standard/react';
import { useContext, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { ConnectWalletMenuItem } from './ConnectWalletMenuItem';
import { UnconnectableWalletMenuItem } from './UnconnectableWalletMenuItem';
import { WalletAccountIcon } from './WalletAccountIcon';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export function ConnectWalletMenu({ children }: Props) {
  const wallets = useWallets();
  const [selectedWalletAccount, setSelectedWalletAccount] = useContext(
    SelectedWalletAccountContext
  );
  const [forceClose, setForceClose] = useState(false);
  const [error, setError] = useState<unknown>();
  function renderItem(wallet: UiWallet) {
    if (error) {
      return <UnconnectableWalletMenuItem error={error} wallet={wallet} />;
    }
    return (
      <ConnectWalletMenuItem
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
        wallet={wallet}
      />
    );
  }
  const walletsThatSupportStandardConnect = [];
  const unconnectableWallets = [];
  for (const wallet of wallets) {
    if (
      wallet.features.includes(StandardConnect) &&
      wallet.features.includes(StandardDisconnect)
    ) {
      walletsThatSupportStandardConnect.push(wallet);
    } else {
      unconnectableWallets.push(wallet);
    }
  }
  return (
    <>
      <DropdownMenu
        open={forceClose ? false : undefined}
        onOpenChange={setForceClose.bind(null, false)}
      >
        <DropdownMenuTrigger>
          <div>
            {selectedWalletAccount ? (
              <>
                <WalletAccountIcon
                  account={selectedWalletAccount}
                  width="18"
                  height="18"
                />
                {selectedWalletAccount.address.slice(0, 8)}
              </>
            ) : (
              children
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {wallets.length === 0 ? (
            <div className="bg-orange-500 text-orange-500">
              This browser has no wallets installed.
            </div>
          ) : (
            <>
              {walletsThatSupportStandardConnect.map(renderItem)}
              {unconnectableWallets.length ? (
                <>
                  <DropdownMenuSeparator />
                  {unconnectableWallets.map(renderItem)}
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
