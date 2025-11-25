'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronDown, Coins, ArrowRightLeft, Flame, Ban, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenDisplay } from '@/types/token';
import { Spinner } from '@/components/ui/spinner';
import { findTokenByAddress } from '@/lib/token/token-data';
import { TokenStorage } from '@/lib/token/token-storage';
import { useConnector } from '@solana/connector/react';
import { TokenOverview } from './components/token-overview';
import { TokenAuthorities } from './components/token-authorities';
import { TokenExtensions } from './components/token-extensions';
import { TransferRestrictions } from './components/transfer-restrictions';
import { AddressModal } from './components/address-modal';
import { MintModalRefactored as MintModal } from './components/mint-modal-refactored';
import { ForceTransferModalRefactored as ForceTransferModal } from './components/force-transfer-modal-refactored';
import { ForceBurnModalRefactored as ForceBurnModal } from './components/force-burn-modal-refactored';
import { ActionResultModal } from './components/action-result-modal';
import { PauseConfirmModal } from './components/pause-confirm-modal';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import {
    addAddressToBlocklist,
    addAddressToAllowlist,
    removeAddressFromBlocklist,
    removeAddressFromAllowlist,
} from '@/lib/management/access-list';
import { Address, createSolanaRpc, Rpc, SolanaRpcApi } from 'gill';
import { getList, getListConfigPda, getTokenExtensions } from '@mosaic/sdk';
import { Mode } from '@token-acl/abl-sdk';
import { pauseTokenWithWallet, unpauseTokenWithWallet, checkTokenPauseState } from '@/lib/management/pause';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconArrowUpRight, IconHexagonFill } from 'symbols-react';
import { motion } from 'motion/react';

export default function ManageTokenPage() {
    const { connected, selectedAccount } = useConnector();
    const params = useParams();
    const address = params.address as string;

    if (!connected || !selectedAccount) {
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
    const { selectedAccount, cluster } = useConnector();
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
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url) as Rpc<SolanaRpcApi>;
    }, [cluster?.url]);

    const loadedAccessListRef = useRef<string | null>(null);

    const refreshAccessList = () => {
        setTimeout(() => {
            loadedAccessListRef.current = null;
            setRefreshTrigger(prev => prev + 1);
        }, 600);
    };

    // Use the connector signer hook which provides a gill-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    useEffect(() => {
        const addTokenExtensionsToFoundToken = async (foundToken: TokenDisplay): Promise<void> => {
            if (!rpc) return;
            const extensions = await getTokenExtensions(rpc, foundToken.address as Address);
            foundToken.extensions = extensions;
            setToken(foundToken);

            if (foundToken.address) {
                const pauseState = await checkTokenPauseState(foundToken.address, cluster?.url || '');
                setIsPaused(pauseState);
            }
        };

        const loadTokenData = () => {
            const foundToken = findTokenByAddress(address);

            if (foundToken) {
                setToken(foundToken);
                addTokenExtensionsToFoundToken(foundToken);
            }

            setLoading(false);
        };

        loadTokenData();
    }, [address, rpc, cluster?.url]);

    useEffect(() => {
        const loadAccessList = async () => {
            if (!rpc) return;

            const currentKey = `${selectedAccount}-${token?.address}-${cluster?.url}-${refreshTrigger}`;

            if (loadedAccessListRef.current === currentKey) {
                return;
            }

            const accessList = await getAccessList(rpc, selectedAccount as Address, token?.address as Address);
            setAccessList(accessList.wallets);
            setListType(accessList.type);
            loadedAccessListRef.current = currentKey;
        };

        if (rpc && selectedAccount && token?.address && token?.isSrfc37) {
            loadAccessList();
        }
    }, [rpc, selectedAccount, token?.address, token?.isSrfc37, cluster?.url, refreshTrigger]);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
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
        if (!selectedAccount || !token?.address || !transactionSendingSigner || !rpc) {
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
                    cluster?.url || '',
                );
            } else {
                result = await removeAddressFromAllowlist(
                    rpc,
                    {
                        mintAddress: token.address,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                    cluster?.url || '',
                );
            }

            if (result.success) {
                setTransactionSignature(result.transactionSignature || '');
                refreshAccessList();
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
        if (!selectedAccount || !rpc) {
            setError('Wallet not connected or RPC not available');
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
                    cluster?.url || '',
                );
            } else {
                result = await addAddressToAllowlist(
                    rpc,
                    {
                        mintAddress,
                        walletAddress: address,
                    },
                    transactionSendingSigner,
                    cluster?.url || '',
                );
            }

            if (result.success) {
                setTransactionSignature(result.transactionSignature || '');
                refreshAccessList();
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
            router.push('/');
        }
    };

    const togglePause = async () => {
        if (!selectedAccount || !token?.address || !transactionSendingSigner) {
            setError('Required parameters not available');
            return;
        }

        // Check if the connected wallet has pause authority
        const walletAddress = selectedAccount;
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
        if (!selectedAccount || !token?.address || !transactionSendingSigner) {
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
                          feePayer: selectedAccount,
                          rpcUrl: cluster?.url || '',
                      },
                      transactionSendingSigner,
                  )
                : await pauseTokenWithWallet(
                      {
                          mintAddress: token.address,
                          pauseAuthority: token.pausableAuthority,
                          feePayer: selectedAccount,
                          rpcUrl: cluster?.url || '',
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
                        <Spinner size={32} className="mx-auto mb-4" />
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
                        <Link href="/">
                            <Button>
                                <ChevronLeft className="h-4 w-4 mr-2" />
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
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-4">                    
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                        <Link className="p-0" href="/">
                            <Button 
                                variant="ghost" 
                                size="icon"
                                className="w-6 h-10 group transition-transform"
                            >
                                <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform duration-200 ease-in-out" />
                            </Button>
                        </Link>
                            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                                <IconHexagonFill className="h-6 w-6 fill-primary/50" width={32} height={32} />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">{token.name}</h1>
                                <p className="text-md text-muted-foreground -mt-1">
                                    {token.symbol}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex space-x-2">
                            <Button size="sm" variant="secondary" className="bg-primary/5 hover:bg-primary/10" onClick={openInExplorer}>
                                Explorer
                                <IconArrowUpRight className="size-2.5 fill-primary/50" />
                            </Button>
                            
                            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="default" className="bg-primary hover:bg-primary/80 text-white">
                                        Admin Actions 
                                        <motion.div
                                            animate={{ rotate: isDropdownOpen ? -180 : 0 }}
                                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                                            className="ml-2"
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </motion.div>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 rounded-xl">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => setShowMintModal(true)}>
                                        <Coins className="h-4 w-4 mr-2" />
                                        Mint Tokens
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => setShowForceTransferModal(true)}>
                                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                                        Force Transfer
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => setShowForceBurnModal(true)}>
                                        <Flame className="h-4 w-4 mr-2" />
                                        Force Burn
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={togglePause}>
                                        {isPaused ? (
                                            <>
                                                <Coins className="h-4 w-4 mr-2" /> Unpause Token
                                            </>
                                        ) : (
                                            <>
                                                <Ban className="h-4 w-4 mr-2" /> Pause Token
                                            </>
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer rounded-lg text-red-600 hover:!bg-red-50 hover:!text-red-600" onClick={handleRemoveFromStorage}>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Remove from Storage
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Token Overview */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold tracking-tight">Token Overview</h2>
                    <TokenOverview token={token} copied={copied} onCopy={copyToClipboard} />
                </div>

                {/* Settings */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
                    <Tabs defaultValue="extensions" className="w-full">
                         <div className="w-full border-b-2 border-border">
                            <TabsList className="translate-y-0.5 w-full justify-start rounded-none h-auto p-0 bg-transparent space-x-6 ring-0">
                                <TabsTrigger 
                                    value="permissions" 
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-b-black dark:data-[state=active]:border-white data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    Permissions
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="blocklist" 
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-b-black dark:data-[state=active]:border-white data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    {listType === 'allowlist' ? 'Allowlist' : 'Blocklist'}
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="extensions" 
                                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-b-black dark:data-[state=active]:border-white data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    Token Extensions
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        
                        <div className="mt-6">
                            <TabsContent value="permissions">
                                <TokenAuthorities setError={setError} token={token} />
                            </TabsContent>
                            <TabsContent value="blocklist">
                                <TransferRestrictions
                                    accessList={accessList}
                                    listType={listType}
                                    onAddToAccessList={() => setShowAccessListModal(true)}
                                    onRemoveFromAccessList={removeFromAccessList}
                                />
                            </TabsContent>
                            <TabsContent value="extensions">
                                <TokenExtensions token={token} />
                            </TabsContent>
                        </div>
                    </Tabs>
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
