import type { UiWallet } from '@wallet-standard/react';
import { useState } from 'react';

import { WalletMenuItemContent } from './WalletMenuItemContent';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '../ui/button';

type Props = Readonly<{
  error: unknown;
  wallet: UiWallet;
}>;

export function UnconnectableWalletMenuItem({ error, wallet }: Props) {
  const [dialogIsOpen, setDialogIsOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem disabled onClick={() => setDialogIsOpen(true)}>
        <WalletMenuItemContent wallet={wallet}>
          <div style={{ textDecoration: 'line-through' }}>{wallet.name}</div>
        </WalletMenuItemContent>
        <div className="rt-BaseMenuShortcut rt-DropdownMenuShortcut">
          <AlertTriangleIcon
            className="rt-BaseMenuSubTriggerIcon rt-DropdownMenuSubtriggerIcon"
            style={{ height: 14, width: 14 }}
          />
        </div>
      </DropdownMenuItem>
      {dialogIsOpen ? (
        <div className="flex flex-col gap-2">
          <h1>Unconnectable wallet</h1>
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          <Button onClick={() => setDialogIsOpen(false)}>OK</Button>
        </div>
      ) : null}
    </>
  );
}
