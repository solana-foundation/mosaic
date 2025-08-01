import type { UiWallet } from '@wallet-standard/react';
import { Loader2Icon } from 'lucide-react';
import Image from 'next/image';

type Props = Readonly<{
  children?: React.ReactNode;
  loading?: boolean;
  wallet: UiWallet;
}>;

export function WalletMenuItemContent({ children, loading, wallet }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-5 h-5">
          <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground">Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-5 h-5">
        <Image
          src={wallet.icon}
          alt={wallet.name}
          width={20}
          height={20}
          className="rounded-full"
        />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">
          {children ?? wallet.name}
        </span>
      </div>
    </div>
  );
}
