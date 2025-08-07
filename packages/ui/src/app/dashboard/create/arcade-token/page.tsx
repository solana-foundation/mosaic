'use client';

import { useContext } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { CreateTemplateSidebar } from '@/components/CreateTemplateSidebar';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { ChainContext } from '@/context/ChainContext';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';
import { UiWalletAccount } from '@wallet-standard/react';
import { ArcadeTokenCreateForm } from '@/app/dashboard/create/arcade-token/ArcadeTokenCreateForm';

// Component that only renders when wallet is available
function ArcadeTokenCreateWithWallet({
  selectedWalletAccount,
  currentChain,
}: {
  selectedWalletAccount: UiWalletAccount;
  currentChain: string;
}) {
  // Now we can safely call the hook because we know we have valid inputs
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    selectedWalletAccount,
    currentChain as `solana:${string}`
  );

  return (
    <div className="flex-1 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-8">
          <Link href="/dashboard/create">
            <Button variant="ghost" className="mr-4">
              ← Back
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold mb-2">Create Arcade Token</h2>
            <p className="text-muted-foreground">
              Configure your arcade token parameters
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 min-w-0">
            <ArcadeTokenCreateForm
              transactionSendingSigner={transactionSendingSigner}
            />
          </div>
          <aside className="space-y-4">
            <CreateTemplateSidebar
              description={
                <>
                  Arcade tokens are closed-loop tokens suitable for in-app or
                  game economies that require an allowlist.
                </>
              }
              coreCapabilityKeys={[
                'closedLoopAllowlistOnly',
                'pausable',
                'metadata',
                'permanentDelegate',
              ]}
              enabledExtensionKeys={[
                'extMetadata',
                'extPausable',
                'extDefaultAccountStateAllow',
                'extPermanentDelegate',
              ]}
              standardKeys={['sRFC37', 'gatingProgram']}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

// Simple wrapper component that shows a message when wallet is not connected
function ArcadeTokenCreatePage() {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { chain: currentChain } = useContext(ChainContext);

  // If wallet is connected and chain is available, render the full component
  if (selectedWalletAccount && currentChain) {
    return (
      <ArcadeTokenCreateWithWallet
        selectedWalletAccount={selectedWalletAccount}
        currentChain={currentChain}
      />
    );
  }

  // Otherwise, show a message to connect wallet
  return (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
          <Link href="/dashboard/create">
            <Button variant="ghost" className="mr-4">
              ← Back
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold mb-2">Create Arcade Token</h2>
            <p className="text-muted-foreground">
              Configure your arcade token parameters
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Wallet Required</CardTitle>
            <CardDescription>
              Please connect your wallet to create an arcade token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              To create an arcade token, you need to connect a wallet first.
              Please use the wallet connection button in the top navigation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ArcadeTokenCreatePage;
