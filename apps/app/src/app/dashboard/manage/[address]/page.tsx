'use client';

import { useContext, useEffect, useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenDisplay } from '@/types/token';
import { Loader } from '@/components/ui/loader';
import { findTokenByAddress } from '@/lib/token/tokenData';
import { TokenStorage } from '@/lib/token/tokenStorage';
import { getTokenTypeLabel } from '@/lib/token/tokenTypeUtils';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { ChainContext } from '@/context/ChainContext';
import { TokenOverview } from './components/TokenOverview';
import { TokenAuthorities } from './components/TokenAuthorities';
import { TokenExtensions } from './components/TokenExtensions';
import { TransferRestrictions } from './components/TransferRestrictions';
import { ActionSidebar } from './components/ActionSidebar';
import { AddressModal } from './components/AddressModal';
import { MintModalRefactored as MintModal } from './components/MintModalRefactored';
import { ForceTransferModalRefactored as ForceTransferModal } from './components/ForceTransferModalRefactored';
import { ForceBurnModalRefactored as ForceBurnModal } from './components/ForceBurnModalRefactored';
import { ActionResultModal } from './components/ActionResultModal';
import { PauseConfirmModal } from './components/PauseConfirmModal';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';
import {
    addAddressToBlocklist,
    addAddressToAllowlist,
    removeAddressFromBlocklist,
    removeAddressFromAllowlist,
} from '@/lib/management/accessList';
import { Address, createSolanaRpc, Rpc, SolanaRpcApi } from 'gill';
import { getList, getListConfigPda, getTokenExtensions } from '@mosaic/sdk';
import { Mode } from '@token-acl/abl-sdk';
import { pauseTokenWithWallet, unpauseTokenWithWallet, checkTokenPauseState } from '@/lib/management/pause';

export default function ManageTokenPage() {
    const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
    const params = useParams();
    const address = params.address as string;

    if (!selectedWalletAccount) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="text-center">
                    <h2 className="text-3xl font-bold mb-4">Wallet Required</h2>
                    <p className="mb-6">Please connect your Solana wallet to manage tokens.</p>
                </div>
            </div>
        );
    }

    return <ManageTokenConnected address={address} />;
}

const getAccessList = async (
    rpc: Rpc<SolanaRpcApi>,
    authority: Address,
    mint: Address,
): Promise<{ type: 'allowlist' | 'blocklist'; wallets: string[] }> => {
    const listConfigPda = await getListConfigPda({
        authority,
        mint,
    });
    const list = await getList({ rpc, listConfig: listConfigPda });
    return {
        type: list.mode === Mode.Allow ? 'allowlist' : 'blocklist',
        wallets: list.wallets,
    };
};

function ManageTokenConnected({ address }: { address: string }) {
    const router = useRouter();
    const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
    const { chain: currentChain, solanaRpcUrl } = useContext(ChainContext);
    const [token, setToken] = useState<TokenDisplay | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [accessList, setAccessList] = useState<string[]>([]);
    const [listType, setListType] = useState<'allowlist' | 'blocklist'>('blocklist');
    const [newAddress, setNewAddress] = useState('');
    const [showAccessListModal, setShowAccessListModal] = useState(false);
    const [showMintModal, setShowMintModal] = useState(false);
    const [showForceTransferModal, setShowForceTransferModal] = useState(false);
    const [showForceBurnModal, setShowForceBurnModal] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [showPauseModal, setShowPauseModal] = useState(false);
    const [pauseError, setPauseError] = useState('');
    const [actionInProgress, setActionInProgress] = useState(false);
    const [error, setError] = useState('');
    const [transactionSignature, setTransactionSignature] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const rpc = useMemo(() => createSolanaRpc(solanaRpcUrl) as Rpc<SolanaRpcApi>, [solanaRpcUrl]);

    // Track if we've already loaded the access list for current dependencies
    const loadedAccessListRef = useRef<string | null>(null);

    // Function to force refresh the access list with a small delay
    const refreshAccessList = () => {
        setTimeout(() => {
            loadedAccessListRef.current = null;
            setRefreshTrigger(prev => prev + 1);
        }, 600); // 600ms delay to allow blockchain/indexer to update
    };

    // Create transaction sending signer if wallet is connected
    const transactionSendingSigner = useWalletAccountTransactionSendingSigner(selectedWalletAccount!, currentChain!);

    useEffect(() => {
        const addTokenExtensionsToFoundToken = async (foundToken: TokenDisplay): Promise<void> => {
            const extensions = await getTokenExtensions(rpc, foundToken.address as Address);
            foundToken.extensions = extensions;
            setToken(foundToken);

            // Check pause state
            if (foundToken.address) {
                const pauseState = await checkTokenPauseState(foundToken.address, solanaRpcUrl);
                setIsPaused(pauseState);
            }
        };

        // Load token data from local storage
        const loadTokenData = () => {
            const foundToken = findTokenByAddress(address);

            if (foundToken) {
                setToken(foundToken);
                addTokenExtensionsToFoundToken(foundToken);
            }

            setLoading(false);
        };

        loadTokenData();
    }, [address, rpc, solanaRpcUrl]);

    useEffect(() => {
        const loadAccessList = async () => {
            const currentKey = `${selectedWalletAccount?.address}-${token?.address}-${solanaRpcUrl}-${refreshTrigger}`;

            // Only load if we haven't already loaded for these dependencies
            if (loadedAccessListRef.current === currentKey) {
                return;
            }

            const accessList = await getAccessList(
                rpc,
                selectedWalletAccount?.address as Address,
                token?.address as Address,
            );
            setAccessList(accessList.wallets);
            setListType(accessList.type);
            loadedAccessListRef.current = currentKey;
        };

        if (rpc && selectedWalletAccount?.address && token?.address && token?.isSrfc37) {
            loadAccessList();
        }
    }, [rpc, selectedWalletAccount?.address, token?.address, token?.isSrfc37, solanaRpcUrl, refreshTrigger]);

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

    const addToAccessList = async () => {
        setShowAccessListModal(false);
        if (newAddress.trim() && accessList.includes(newAddress.trim())) {
            setError('Address already in list');
            return;
        }

        await handleAddToAccessList(token?.address || '', newAddress.trim());
        setNewAddress('');
    };

    const removeFromAccessList = async (address: string) => {
        if (!selectedWalletAccount?.address || !token?.address || !transactionSendingSigner) {
            setError('Required parameters not available');
            return;
        }

        setActionInProgress(true);
        setError('');

        try {
            let result;
            if (listType === 'blocklist') {
                result = await removeAddressFromBlocklist(
                    rpc,
                    {
                        mintAddress: token.address,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                );
            } else {
                result = await removeAddressFromAllowlist(
                    rpc,
                    {
                        mintAddress: token.address,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                );
            }

            if (result.success) {
                setTransactionSignature(result.transactionSignature || '');
                refreshAccessList(); // Refresh access list after successful removal
            } else {
                setError(result.error || 'Removal failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setActionInProgress(false);
        }
    };

    const handleAddToAccessList = async (mintAddress: string, address: string) => {
        if (!selectedWalletAccount?.address) {
            setError('Wallet not connected');
            return;
        }

        setActionInProgress(true);
        setError('');

        try {
            if (!transactionSendingSigner) {
                throw new Error('Transaction signer not available');
            }

            let result;
            if (listType === 'blocklist') {
                result = await addAddressToBlocklist(
                    rpc,
                    {
                        mintAddress,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                );
            } else {
                result = await addAddressToAllowlist(
                    rpc,
                    {
                        mintAddress,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                );
            }

            if (result.success) {
                setTransactionSignature(result.transactionSignature || '');
                refreshAccessList(); // Refresh access list after successful addition
            } else {
                setError(result.error || 'Operation failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setActionInProgress(false);
        }
    };

    const handleRemoveFromStorage = () => {
        if (
            confirm(
                'Are you sure you want to remove this token from your local storage? This only removes it from your browser - the token will continue to exist on the blockchain.',
            )
        ) {
            TokenStorage.removeToken(address);
            router.push('/dashboard');
        }
    };

    const togglePause = async () => {
        if (!selectedWalletAccount?.address || !token?.address || !transactionSendingSigner) {
            setError('Required parameters not available');
            return;
        }

        // Check if the connected wallet has pause authority
        const walletAddress = selectedWalletAccount.address.toString();
        if (token.pausableAuthority !== walletAddress) {
            setPauseError(
                'Connected wallet does not have pause authority. Only the pause authority can pause/unpause this token.',
            );
            setShowPauseModal(true);
            return;
        }

        // Show confirmation modal
        setShowPauseModal(true);
    };

    const handlePauseConfirm = async () => {
        if (!selectedWalletAccount?.address || !token?.address || !transactionSendingSigner) {
            setPauseError('Required parameters not available');
            return;
        }

        setActionInProgress(true);
        setPauseError('');

        try {
            const result = isPaused
                ? await unpauseTokenWithWallet(
                      {
                          mintAddress: token.address,
                          pauseAuthority: token.pausableAuthority,
                          feePayer: selectedWalletAccount.address.toString(),
                          rpcUrl: solanaRpcUrl,
                      },
                      transactionSendingSigner,
                  )
                : await pauseTokenWithWallet(
                      {
                          mintAddress: token.address,
                          pauseAuthority: token.pausableAuthority,
                          feePayer: selectedWalletAccount.address.toString(),
                          rpcUrl: solanaRpcUrl,
                      },
                      transactionSendingSigner,
                  );

            if (result.success) {
                setTransactionSignature(result.transactionSignature || '');
                setIsPaused(result.paused ?? !isPaused);
                setShowPauseModal(false);

                // Update token in local storage
                const storedTokens = JSON.parse(localStorage.getItem('mosaic_tokens') || '[]') as TokenDisplay[];
                const updatedTokens = storedTokens.map(t => {
                    if (t.address === token.address) {
                        return { ...t, isPaused: result.paused ?? !isPaused };
                    }
                    return t;
                });
                localStorage.setItem('mosaic_tokens', JSON.stringify(updatedTokens));
            } else {
                setPauseError(result.error || 'Operation failed');
            }
        } catch (err) {
            setPauseError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setActionInProgress(false);
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
                                Manage your {getTokenPatternsLabel(token.detectedPatterns)} token
                            </p>
                        </div>
                    </div>
                    <div className="flex space-x-2">
                        <Button variant="outline" onClick={openInExplorer}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View on Explorer
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        <TokenOverview token={token} copied={copied} onCopy={copyToClipboard} />
                        <TokenAuthorities setError={setError} token={token} />
                        <TransferRestrictions
                            accessList={accessList}
                            listType={listType}
                            onAddToAccessList={() => setShowAccessListModal(true)}
                            onRemoveFromAccessList={removeFromAccessList}
                        />
                        <TokenExtensions token={token} />
                    </div>

                    {/* Sidebar */}
                    <ActionSidebar
                        isPaused={isPaused}
                        onTogglePause={togglePause}
                        onMintTokens={() => setShowMintModal(true)}
                        onForceTransfer={() => setShowForceTransferModal(true)}
                        onForceBurn={() => setShowForceBurnModal(true)}
                        onRemoveFromStorage={handleRemoveFromStorage}
                    />
                </div>
            </div>

            {/* Modals */}
            <ActionResultModal
                isOpen={!!error || !!transactionSignature || !!actionInProgress}
                onClose={() => {
                    setError('');
                    setTransactionSignature('');
                    setActionInProgress(false);
                }}
                actionInProgress={actionInProgress}
                error={error}
                transactionSignature={transactionSignature}
            />

            <AddressModal
                isOpen={showAccessListModal}
                onClose={() => {
                    setShowAccessListModal(false);
                    setNewAddress('');
                }}
                onAdd={addToAccessList}
                newAddress={newAddress}
                onAddressChange={setNewAddress}
                title={`Add to ${listType === 'allowlist' ? 'Allowlist' : 'Blocklist'}`}
                placeholder="Enter Solana address..."
                buttonText={`Add to ${listType === 'allowlist' ? 'Allowlist' : 'Blocklist'}`}
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

            {transactionSendingSigner && (
                <ForceTransferModal
                    isOpen={showForceTransferModal}
                    onClose={() => setShowForceTransferModal(false)}
                    mintAddress={address}
                    permanentDelegate={token?.permanentDelegateAuthority}
                    transactionSendingSigner={transactionSendingSigner}
                />
            )}

            {transactionSendingSigner && (
                <ForceBurnModal
                    isOpen={showForceBurnModal}
                    onClose={() => setShowForceBurnModal(false)}
                    mintAddress={address}
                    permanentDelegate={token?.permanentDelegateAuthority}
                    transactionSendingSigner={transactionSendingSigner}
                />
            )}

            <PauseConfirmModal
                isOpen={showPauseModal}
                onClose={() => {
                    setShowPauseModal(false);
                    setPauseError('');
                }}
                onConfirm={handlePauseConfirm}
                isPaused={isPaused}
                tokenName={token?.name || 'Token'}
                isLoading={actionInProgress}
                error={pauseError}
            />
        </div>
    );
}
