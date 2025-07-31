'use client';

import { useContext, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Settings,
  Coins,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  Plus,
  X,
  Shield,
  Ban,
  Calendar,
  Hash,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TokenDisplay } from '@/types/token';
import { findTokenByAddress } from '@/lib/tokenData';
import { TokenStorage } from '@/lib/tokenStorage';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';

export default function ManageTokenPage() {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const params = useParams();
  const address = params.address as string;

  if (!selectedWalletAccount) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Wallet Required</h2>
          <p className="mb-6">
            Please connect your Solana wallet to manage tokens.
          </p>
        </div>
      </div>
    );
  }

  return <ManageTokenConnected address={address} />;
}

function ManageTokenConnected({ address }: { address: string }) {
  const [token, setToken] = useState<TokenDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [showAllowlistModal, setShowAllowlistModal] = useState(false);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    // Load token data from local storage
    const loadTokenData = () => {
      const foundToken = findTokenByAddress(address);

      if (foundToken) {
        setToken(foundToken);

        // Initialize empty lists - in a real app, these would be loaded from the blockchain
        setAllowlist([]);
        setBlocklist([]);
      }

      setLoading(false);
    };

    loadTokenData();
  }, [address]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently handle copy errors
    }
  };

  const openInExplorer = () => {
    window.open(`https://explorer.solana.com/address/${address}?cluster=devnet`, '_blank');
  };

  const openInSolscan = () => {
    window.open(`https://solscan.io/token/${address}?cluster=devnet`, '_blank');
  };

  const addToAllowlist = () => {
    if (newAddress.trim() && !allowlist.includes(newAddress.trim())) {
      setAllowlist([...allowlist, newAddress.trim()]);
      setNewAddress('');
      setShowAllowlistModal(false);
    }
  };

  const removeFromAllowlist = (address: string) => {
    setAllowlist(allowlist.filter(addr => addr !== address));
  };

  const addToBlocklist = () => {
    if (newAddress.trim() && !blocklist.includes(newAddress.trim())) {
      setBlocklist([...blocklist, newAddress.trim()]);
      setNewAddress('');
      setShowBlocklistModal(false);
    }
  };

  const removeFromBlocklist = (address: string) => {
    setBlocklist(blocklist.filter(addr => addr !== address));
  };

  const validateSolanaAddress = (address: string) => {
    // Basic Solana address validation (44 characters, base58)
    return /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(address);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    // TODO: Implement actual pause/unpause transaction
    // console.log(`${isPaused ? 'Unpausing' : 'Pausing'} token: ${address}`);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading token details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">Token Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The token with address {address} could not be found in your local storage.
            </p>
            <Link href="/dashboard">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{token.name}</h1>
              <p className="text-muted-foreground">
                Manage your {getTokenTypeLabel(token.type)} token
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={openInSolscan}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Solscan
            </Button>
            <Button variant="outline" onClick={openInExplorer}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Explorer
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Token Overview */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Coins className="h-5 w-5 mr-2" />
                  Token Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Name
                    </label>
                    <p className="text-lg font-semibold">{token.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Symbol
                    </label>
                    <p className="text-lg font-semibold">{token.symbol}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Supply
                    </label>
                    <p className="text-lg font-semibold">{token.supply || '0'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Decimals
                    </label>
                    <p className="text-lg font-semibold">{token.decimals || '6'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Type
                    </label>
                    <p className="text-lg font-semibold">
                      {getTokenTypeLabel(token.type)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Created
                    </label>
                    <p className="text-lg font-semibold">{formatDate(token.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Status
                    </label>
                    <div className="flex items-center">
                      <p
                        className={`text-lg font-semibold ${isPaused ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {isPaused ? 'Paused' : 'Active'}
                      </p>
                      {isPaused && (
                        <Ban className="h-4 w-4 ml-2 text-red-600" />
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Token Address
                  </label>
                  <div className="flex items-start space-x-2 mt-1">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                      {token.address}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(token.address || '')}
                      className="flex-shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copied && (
                    <p className="text-sm text-green-600 mt-1">
                      Copied to clipboard!
                    </p>
                  )}
                </div>

                {token.transactionSignature && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Creation Transaction
                    </label>
                    <div className="flex items-start space-x-2 mt-1">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                        {token.transactionSignature}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(token.transactionSignature || '')}
                        className="flex-shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {token.metadataUri && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Metadata URI
                    </label>
                    <p className="text-sm bg-muted px-3 py-2 rounded mt-1">
                      {token.metadataUri}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Authorities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Token Authorities
                </CardTitle>
                <CardDescription>
                  Manage the authorities for this token
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {token.mintAuthority && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Mint Authority
                      </label>
                      <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                        {token.mintAuthority.slice(0, 8)}...{token.mintAuthority.slice(-8)}
                      </code>
                    </div>
                  )}
                  {token.metadataAuthority && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Metadata Authority
                      </label>
                      <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                        {token.metadataAuthority.slice(0, 8)}...{token.metadataAuthority.slice(-8)}
                      </code>
                    </div>
                  )}
                  {token.pausableAuthority && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Pausable Authority
                      </label>
                      <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                        {token.pausableAuthority.slice(0, 8)}...{token.pausableAuthority.slice(-8)}
                      </code>
                    </div>
                  )}
                  {token.confidentialBalancesAuthority && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Confidential Balances Authority
                      </label>
                      <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                        {token.confidentialBalancesAuthority.slice(0, 8)}...{token.confidentialBalancesAuthority.slice(-8)}
                      </code>
                    </div>
                  )}
                  {token.permanentDelegateAuthority && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Permanent Delegate Authority
                      </label>
                      <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                        {token.permanentDelegateAuthority.slice(0, 8)}...{token.permanentDelegateAuthority.slice(-8)}
                      </code>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Extensions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Token Extensions
                </CardTitle>
                <CardDescription>
                  Extensions enabled on this token
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {token.extensions && token.extensions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {token.extensions.map((extension, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                        >
                          {extension}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No extensions configured
                    </p>
                  )}

                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">Transfer Restrictions</h4>
                        <p className="text-sm text-muted-foreground">
                          Control who can transfer tokens
                        </p>
                      </div>
                    </div>

                    {/* Transfer Restrictions based on token type */}
                    {token && token.type === 'stablecoin' ? (
                      /* Blocklist for Stablecoins */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <Ban className="h-4 w-4 mr-2 text-red-600" />
                            <h5 className="font-medium">Blocklist</h5>
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                              Stablecoin
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowBlocklistModal(true)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Address
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Block specific addresses from transferring this
                          stablecoin
                        </p>
                        {blocklist.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No addresses in blocklist
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {blocklist.map((addr, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-muted rounded"
                              >
                                <code className="text-xs font-mono flex-1">
                                  {addr.slice(0, 8)}...{addr.slice(-8)}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFromBlocklist(addr)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Allowlist for Arcade Tokens */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <Shield className="h-4 w-4 mr-2 text-green-600" />
                            <h5 className="font-medium">Allowlist</h5>
                            <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              Arcade Token
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllowlistModal(true)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Address
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Allow only specific addresses to transfer this arcade
                          token
                        </p>
                        {allowlist.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No addresses in allowlist
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {allowlist.map((addr, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-muted rounded"
                              >
                                <code className="text-xs font-mono flex-1">
                                  {addr.slice(0, 8)}...{addr.slice(-8)}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFromAllowlist(addr)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Metadata</h4>
                      <p className="text-sm text-muted-foreground">
                        Update token metadata and URI
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" variant="outline">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Token
                </Button>
                <Button className="w-full" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Extensions
                </Button>
                <Button className="w-full" variant="outline">
                  <Coins className="h-4 w-4 mr-2" />
                  Mint Tokens
                </Button>
                <Button
                  className="w-full"
                  variant={isPaused ? 'default' : 'outline'}
                  onClick={togglePause}
                >
                  {isPaused ? (
                    <>
                      <Coins className="h-4 w-4 mr-2" />
                      Unpause Token
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-2" />
                      Pause Token
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Danger Zone</CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Burn Token
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Allowlist Modal */}
      {showAllowlistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Add to Allowlist{' '}
              {token && token.type !== 'stablecoin' && '(Arcade Token)'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Solana Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder="Enter Solana address..."
                  className="w-full p-2 border rounded-md"
                />
                {newAddress && !validateSolanaAddress(newAddress) && (
                  <p className="text-sm text-red-600 mt-1">
                    Please enter a valid Solana address
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={addToAllowlist}
                  disabled={
                    !newAddress.trim() || !validateSolanaAddress(newAddress)
                  }
                  className="flex-1"
                >
                  Add to Allowlist
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAllowlistModal(false);
                    setNewAddress('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blocklist Modal */}
      {showBlocklistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Add to Blocklist{' '}
              {token && token.type === 'stablecoin' && '(Stablecoin)'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Solana Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder="Enter Solana address..."
                  className="w-full p-2 border rounded-md"
                />
                {newAddress && !validateSolanaAddress(newAddress) && (
                  <p className="text-sm text-red-600 mt-1">
                    Please enter a valid Solana address
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={addToBlocklist}
                  disabled={
                    !newAddress.trim() || !validateSolanaAddress(newAddress)
                  }
                  className="flex-1"
                >
                  Add to Blocklist
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBlocklistModal(false);
                    setNewAddress('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
