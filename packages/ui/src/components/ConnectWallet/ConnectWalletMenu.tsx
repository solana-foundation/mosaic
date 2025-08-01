import { StandardConnect, StandardDisconnect } from '@wallet-standard/core';
import {
  type UiWallet,
  type UiWalletAccount,
  uiWalletAccountBelongsToUiWallet,
  useWallets,
} from '@wallet-standard/react';
import { useContext, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

function WalletMenuItem({
  wallet,
  error,
  onAccountSelect,
  onDisconnect,
  onError,
}: WalletMenuItemProps) {
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
  const [selectedWalletAccount, setSelectedWalletAccount] = useContext(
    SelectedWalletAccountContext
  );
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
      <DropdownMenu
        open={forceClose ? false : undefined}
        onOpenChange={() => setForceClose(false)}
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
              {walletsThatSupportStandardConnect.map((wallet, index) => (
                <div key={`${wallet.name}-${index}`}>
                  <WalletMenuItem
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
                </div>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
