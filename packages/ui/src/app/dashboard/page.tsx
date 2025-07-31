'use client';

import { useContext, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Settings, Coins, Trash2, ExternalLink } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { getAllTokens, getTokenCount } from '@/lib/token/tokenData';
import { TokenStorage } from '@/lib/token/tokenStorage';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';

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

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getTokenTypeLabel = (type?: string) => {
    switch (type) {
      case 'stablecoin':
        return 'Stablecoin';
      case 'arcade-token':
        return 'Arcade Token';
      default:
        return type || 'Unknown';
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
            <Card key={index} className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Coins className="h-6 w-6 text-primary mr-3" />
                    <div>
                      <CardTitle className="text-lg">
                        {token.name || `Token ${index + 1}`}{' '}
                        <Badge className="ml-2 align-middle text-sm" variant="outline">
                          {token.symbol || 'TKN'}
                        </Badge>
                      </CardTitle>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/manage/${token.address}`}>
                          <Settings className="h-4 w-4 mr-2" />
                          Manage
                        </Link>
                      </DropdownMenuItem>
                      {token.address && (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://solscan.io/token/${token.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View on Solscan
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDeleteToken(token.address!)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete from Storage
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-normal">
                      {getTokenTypeLabel(token.type)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supply:</span>
                    <span className="font-normal">{token.supply || '0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Decimals:</span>
                    <span className="font-normal">{token.decimals || '6'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-normal">{formatDate(token.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-green-600 font-normal">Active</span>
                  </div>
                  {token.extensions && token.extensions.length > 0 && (
                    <div className="pt-2">
                      <span className="text-muted-foreground text-xs">
                        Extensions:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {token.extensions.slice(0, 2).map((ext, idx) => (
                          <span
                            key={idx}
                            className="px-1 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                          >
                            {ext}
                          </span>
                        ))}
                        {token.extensions.length > 2 && (
                          <span className="px-1 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            +{token.extensions.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Link
                  href={`/dashboard/manage/${token.address}`}
                  className="w-full"
                >
                  <Button variant="outline" className="w-full">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </Link>
              </CardFooter>
            </Card>
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
