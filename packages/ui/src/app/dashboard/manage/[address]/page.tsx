'use client';

import { useContext, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TokenDisplay } from '@/types/token';
import { Loader } from '@/components/ui/loader';
import { findTokenByAddress } from '@/lib/token/tokenData';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { ChainContext } from '@/context/ChainContext';
import { TokenOverview } from './components/TokenOverview';
import { TokenAuthorities } from './components/TokenAuthorities';
import { TokenExtensions } from './components/TokenExtensions';
import { ActionSidebar } from './components/ActionSidebar';
import { AddressModal } from './components/AddressModal';
import { MintModal } from './components/MintModal';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';

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
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { chain: currentChain } = useContext(ChainContext);
  const [token, setToken] = useState<TokenDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [showAllowlistModal, setShowAllowlistModal] = useState(false);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [showMintModal, setShowMintModal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Create transaction sending signer if wallet is connected
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    selectedWalletAccount!,
    currentChain!
  );

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
    window.open(
      `https://explorer.solana.com/address/${address}?cluster=devnet`,
      '_blank'
    );
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
              The token with address {address} could not be found in your local
              storage.
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
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <TokenOverview
              token={token}
              copied={copied}
              onCopy={copyToClipboard}
            />
            <TokenAuthorities token={token} />
            <TokenExtensions
              token={token}
              allowlist={allowlist}
              blocklist={blocklist}
              onAddToAllowlist={() => setShowAllowlistModal(true)}
              onRemoveFromAllowlist={removeFromAllowlist}
              onAddToBlocklist={() => setShowBlocklistModal(true)}
              onRemoveFromBlocklist={removeFromBlocklist}
            />
          </div>

          {/* Sidebar */}
          <ActionSidebar
            isPaused={isPaused}
            onTogglePause={togglePause}
            onMintTokens={() => setShowMintModal(true)}
          />
        </div>
      </div>

      {/* Modals */}
      <AddressModal
        isOpen={showAllowlistModal}
        onClose={() => {
          setShowAllowlistModal(false);
          setNewAddress('');
        }}
        onAdd={addToAllowlist}
        newAddress={newAddress}
        onAddressChange={setNewAddress}
        title={`Add to Allowlist ${token && token.type !== 'stablecoin' ? '(Arcade Token)' : ''}`}
        placeholder="Enter Solana address..."
        buttonText="Add to Allowlist"
        isAddressValid={validateSolanaAddress(newAddress)}
      />

      <AddressModal
        isOpen={showBlocklistModal}
        onClose={() => {
          setShowBlocklistModal(false);
          setNewAddress('');
        }}
        onAdd={addToBlocklist}
        newAddress={newAddress}
        onAddressChange={setNewAddress}
        title={`Add to Blocklist ${token && token.type === 'stablecoin' ? '(Stablecoin)' : ''}`}
        placeholder="Enter Solana address..."
        buttonText="Add to Blocklist"
        isAddressValid={validateSolanaAddress(newAddress)}
      />

      {transactionSendingSigner && (
        <MintModal
          isOpen={showMintModal}
          onClose={() => setShowMintModal(false)}
          mintAddress={address}
          mintAuthority={token?.mintAuthority}
          transactionSendingSigner={transactionSendingSigner}
        />
      )}
    </div>
  );
}
