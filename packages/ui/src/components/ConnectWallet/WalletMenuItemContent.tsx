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
      <div className="flex items-center gap-2">
        <Loader2Icon className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <Image
          src={wallet.icon}
          alt={wallet.name}
          width={18}
          height={18}
          className="rounded-full"
        />
      </div>
      <div className="truncate">{children ?? wallet.name}</div>
    </div>
  );
}
