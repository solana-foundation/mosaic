'use client';

import { useContext, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Coins } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenDisplay } from '@/types/token';
import { Loader } from '@/components/ui/loader';
import { getAllTokens, getTokenCount } from '@/lib/token/tokenData';
import { TokenStorage } from '@/lib/token/tokenStorage';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { TokenCard } from './components/TokenCard';

export default function DashboardPage() {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);

  return selectedWalletAccount ? (
    <DashboardConnected publicKey={selectedWalletAccount.address} />
  ) : (
    <DashboardDisconnected />
  );
}

function DashboardConnected({ publicKey }: { publicKey: string }) {
  const [tokens, setTokens] = useState<TokenDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load tokens from local storage
    const loadTokens = () => {
      const storedTokens = getAllTokens();
      setTokens(storedTokens);
      setLoading(false);
    };

    loadTokens();
  }, []);

  const handleDeleteToken = (address: string) => {
    if (
      confirm(
        'Are you sure you want to delete this token from your local storage?'
      )
    ) {
      TokenStorage.deleteToken(address);
      setTokens(getAllTokens());
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader className="h-8 w-8 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your tokens...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Welcome to Mosaic</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Create your first token to get started with tokenization on Solana
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center">
                  <Coins className="h-8 w-8 text-primary mr-3" />
                  <CardTitle>Stablecoin</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription>
                  Create a regulatory-compliant stablecoin with transfer
                  restrictions and metadata management.
                </CardDescription>
              </CardContent>
              <CardFooter>
                <Link href="/dashboard/create/stablecoin" className="w-full">
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Stablecoin
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center">
                  <Coins className="h-8 w-8 text-primary mr-3" />
                  <CardTitle>Arcade Token</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription>
                  Deploy a gaming or utility token with custom extensions and
                  features.
                </CardDescription>
              </CardContent>
              <CardFooter>
                <Link href="/dashboard/create/arcade-token" className="w-full">
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Arcade Token
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Public Key: {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Tokens</h2>
            <p className="text-muted-foreground">
              Manage your created tokens and their extensions ({getTokenCount()}{' '}
              total)
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create New Token
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/create/stablecoin">
                  <Coins className="h-4 w-4 mr-2" />
                  Stablecoin
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/create/arcade-token">
                  <Coins className="h-4 w-4 mr-2" />
                  Arcade Token
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token, index) => (
            <TokenCard
              key={index}
              token={token}
              index={index}
              onDelete={handleDeleteToken}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardDisconnected() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-4">Welcome to Mosaic</h2>
        <p className="mb-6">
          Please connect your Solana wallet to access the dashboard.
        </p>
      </div>
    </div>
  );
}
