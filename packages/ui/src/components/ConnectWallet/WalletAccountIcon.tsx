import {
  type UiWalletAccount,
  uiWalletAccountBelongsToUiWallet,
  useWallets,
} from '@wallet-standard/react';
import Image from 'next/image';
import React from 'react';

type Props = React.ComponentProps<'img'> &
  Readonly<{
    account: UiWalletAccount;
  }>;

export function WalletAccountIcon({ account }: Props) {
  const wallets = useWallets();
  let icon;
  if (account.icon) {
    icon = account.icon;
  } else {
    for (const wallet of wallets) {
      if (uiWalletAccountBelongsToUiWallet(account, wallet)) {
        icon = wallet.icon;
        break;
      }
    }
  }
  return icon ? (
    <Image
      src={icon}
      alt={account.address}
      width={18}
      height={18}
      className="rounded-full"
    />
  ) : null;
}
