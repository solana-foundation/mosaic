'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
    ChevronLeft,
    ChevronDown,
    Coins,
    ArrowRightLeft,
    Flame,
    Ban,
    Trash2,
    Snowflake,
    Sun,
    Send,
    FileText,
    XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenDisplay } from '@/types/token';
import { Spinner } from '@/components/ui/spinner';
import { useConnector } from '@solana/connector/react';
import { useTokenStore } from '@/stores/token-store';
import { TokenOverview } from './components/token-overview';
import { TokenAuthorities } from './components/token-authorities';
import { TokenExtensions } from './components/token-extensions';
import { TransferRestrictions } from './components/transfer-restrictions';
import { AddressModal } from './components/address-modal';
import { MintModalContent } from './components/mint-modal-refactored';
import { ForceTransferModalContent } from './components/force-transfer-modal-refactored';
import { ForceBurnModalContent } from './components/force-burn-modal-refactored';
import { ActionResultModal } from './components/action-result-modal';
import { PauseConfirmModalContent } from './components/pause-confirm-modal';
import { FreezeThawModalContent } from './components/freeze-thaw-modal';
import { TransferModalContent } from './components/transfer-modal';
import { BurnModalContent } from './components/burn-modal';
import { UpdateMetadataModalContent } from './components/update-metadata-modal';
import { CloseAccountModalContent } from './components/close-account-modal';
import { DeleteTokenModalContent } from '@/app/components/delete-token-modal';
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
import { AlertDialog, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { IconArrowUpRight, IconHexagonFill } from 'symbols-react';

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
): Promise<{ type: 'allowlist' | 'blocklist'; wallets: string[] } | null> => {
    try {
        const listConfigPda = await getListConfigPda({
            authority,
            mint,
        });
        const list = await getList({ rpc, listConfig: listConfigPda });
        return {
            type: list.mode === Mode.Allow ? 'allowlist' : 'blocklist',
            wallets: list.wallets,
        };
    } catch {
        // List config account doesn't exist yet - this is normal for tokens that
        // have SRFC-37 enabled but haven't had their access list initialized
        return null;
    }
};

/**
 * Safely extracts cluster name from cluster object.
 * Handles different cluster object structures from @solana/connector.
 */
function getClusterName(cluster: unknown): string | undefined {
    if (!cluster || typeof cluster !== 'object') return undefined;

    // Try to access name property (may not be in type definition but exists at runtime)
    const clusterObj = cluster as Record<string, unknown>;
    if (typeof clusterObj.name === 'string') {
        return clusterObj.name;
    }

    // Fallback: try to infer from id (e.g., 'solana:mainnet' -> 'mainnet')
    if (typeof clusterObj.id === 'string') {
        const idParts = clusterObj.id.split(':');
        if (idParts.length > 1) {
            const network = idParts[1];
            // Map 'mainnet' to 'mainnet-beta' for consistency
            return network === 'mainnet' ? 'mainnet-beta' : network;
        }
    }

    // Fallback: try to infer from URL
    if (typeof clusterObj.url === 'string') {
        const url = clusterObj.url.toLowerCase();
        if (url.includes('mainnet') || url.includes('api.mainnet')) {
            return 'mainnet-beta';
        }
        if (url.includes('devnet') || url.includes('api.devnet')) {
            return 'devnet';
        }
        if (url.includes('testnet') || url.includes('api.testnet')) {
            return 'testnet';
        }
    }

    return undefined;
}

function ManageTokenConnected({ address }: { address: string }) {
    const router = useRouter();
    const { selectedAccount, cluster } = useConnector();
    const findTokenByAddress = useTokenStore(state => state.findTokenByAddress);
    const removeToken = useTokenStore(state => state.removeToken);
    const [token, setToken] = useState<TokenDisplay | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [accessList, setAccessList] = useState<string[]>([]);
    const [listType, setListType] = useState<'allowlist' | 'blocklist'>('blocklist');
    const [newAddress, setNewAddress] = useState('');
    const [showAccessListModal, setShowAccessListModal] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [pauseError, setPauseError] = useState('');
    const [actionInProgress, setActionInProgress] = useState(false);
    const [error, setError] = useState('');
    const [transactionSignature, setTransactionSignature] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [supplyRefreshTrigger, setSupplyRefreshTrigger] = useState(0);

    // Function to trigger supply refresh after mint/burn actions
    const refreshSupply = () => {
        setSupplyRefreshTrigger(prev => prev + 1);
    };

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

            try {
                const extensions = await getTokenExtensions(rpc, foundToken.address as Address);
                foundToken.extensions = extensions;
                setToken(foundToken);

                if (foundToken.address) {
                    const pauseState = await checkTokenPauseState(foundToken.address, cluster?.url || '');
                    setIsPaused(pauseState);
                }
            } catch (err) {
                // Token might not exist on this network - show the token with empty extensions
                console.warn('Failed to fetch token extensions:', err instanceof Error ? err.message : err);
                setToken(foundToken);
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
    }, [address, rpc, cluster?.url, findTokenByAddress]);

    useEffect(() => {
        const loadAccessList = async () => {
            if (!rpc) return;

            const currentKey = `${selectedAccount}-${token?.address}-${cluster?.url}-${refreshTrigger}`;

            if (loadedAccessListRef.current === currentKey) {
                return;
            }

            const result = await getAccessList(rpc, selectedAccount as Address, token?.address as Address);
            if (result) {
                setAccessList(result.wallets);
                setListType(result.type);
            } else {
                // Access list not initialized yet - set empty list
                setAccessList([]);
            }
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
        const clusterName = getClusterName(cluster) || 'devnet';
        const isMainnet = clusterName === 'mainnet' || clusterName === 'mainnet-beta';
        const explorerUrl = isMainnet
            ? `https://explorer.solana.com/address/${address}`
            : `https://explorer.solana.com/address/${address}?cluster=${clusterName}`;
        window.open(explorerUrl, '_blank');
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
        removeToken(address);
        router.push('/');
    };

    const handlePauseConfirm = async () => {
        if (!selectedAccount || !token?.address || !transactionSendingSigner) {
            setPauseError('Required parameters not available');
            return;
        }

        // Check if the connected wallet has pause authority
        // Convert both to strings for comparison (selectedAccount might be an Address object)
        const walletAddress = String(selectedAccount);
        const pauseAuthority = token.pausableAuthority ? String(token.pausableAuthority) : '';

        if (pauseAuthority && pauseAuthority !== walletAddress) {
            setPauseError(
                'Connected wallet does not have pause authority. Only the pause authority can pause/unpause this token.',
            );
            return;
        }

        // Clear any previous errors and start the action
        setPauseError('');
        setActionInProgress(true);

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
            } else {
                setError(result.error || 'Operation failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
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
                                <Button variant="ghost" size="icon" className="w-6 h-10 group transition-transform">
                                    <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform duration-200 ease-in-out" />
                                </Button>
                            </Link>
                            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                                <IconHexagonFill className="h-6 w-6 fill-primary/50" width={32} height={32} />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">{token.name}</h1>
                                <p className="text-md text-muted-foreground -mt-1">{token.symbol}</p>
                            </div>
                        </div>

                        <div className="flex space-x-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="bg-primary/5 hover:bg-primary/10"
                                onClick={openInExplorer}
                            >
                                Explorer
                                <IconArrowUpRight className="size-2.5 fill-primary/50" />
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="group bg-primary hover:bg-primary/80 text-white pr-2"
                                    >
                                        Admin Actions
                                        <ChevronDown className="h-4 w-4 ml-2 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 rounded-xl">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {transactionSendingSigner && (
                                        <>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Coins className="h-4 w-4 mr-2" />
                                                        Mint Tokens
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <MintModalContent
                                                    mintAddress={address}
                                                    mintAuthority={token?.mintAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                    onSuccess={refreshSupply}
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Send className="h-4 w-4 mr-2" />
                                                        Transfer Tokens
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <TransferModalContent
                                                    mintAddress={address}
                                                    tokenSymbol={token?.symbol}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Flame className="h-4 w-4 mr-2" />
                                                        Burn Tokens
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <BurnModalContent
                                                    mintAddress={address}
                                                    tokenSymbol={token?.symbol}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                    onSuccess={refreshSupply}
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <FileText className="h-4 w-4 mr-2" />
                                                        Update Metadata
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <UpdateMetadataModalContent
                                                    mintAddress={address}
                                                    currentName={token?.name}
                                                    currentSymbol={token?.symbol}
                                                    currentUri={token?.metadataUri}
                                                    metadataAuthority={token?.metadataAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                />
                                            </AlertDialog>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Admin Actions</DropdownMenuLabel>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                                                        Force Transfer
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <ForceTransferModalContent
                                                    mintAddress={address}
                                                    permanentDelegate={token?.permanentDelegateAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Flame className="h-4 w-4 mr-2" />
                                                        Force Burn
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <ForceBurnModalContent
                                                    mintAddress={address}
                                                    permanentDelegate={token?.permanentDelegateAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                    onSuccess={refreshSupply}
                                                />
                                            </AlertDialog>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Account Management</DropdownMenuLabel>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Snowflake className="h-4 w-4 mr-2" />
                                                        Freeze Account
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <FreezeThawModalContent
                                                    mintAddress={address}
                                                    freezeAuthority={token?.freezeAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                    mode="freeze"
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Sun className="h-4 w-4 mr-2" />
                                                        Thaw Account
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <FreezeThawModalContent
                                                    mintAddress={address}
                                                    freezeAuthority={token?.freezeAuthority}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                    mode="thaw"
                                                />
                                            </AlertDialog>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        Close Token Account
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <CloseAccountModalContent
                                                    mintAddress={address}
                                                    tokenSymbol={token?.symbol}
                                                    transactionSendingSigner={transactionSendingSigner}
                                                />
                                            </AlertDialog>
                                        </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <AlertDialog
                                        onOpenChange={open => {
                                            if (!open) {
                                                setPauseError('');
                                            }
                                        }}
                                    >
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem
                                                className="cursor-pointer rounded-lg"
                                                onSelect={e => e.preventDefault()}
                                            >
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
                                        </AlertDialogTrigger>
                                        <PauseConfirmModalContent
                                            onConfirm={handlePauseConfirm}
                                            isPaused={isPaused}
                                            tokenName={token?.name || 'Token'}
                                            isLoading={actionInProgress}
                                            error={pauseError}
                                        />
                                    </AlertDialog>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem
                                                onSelect={e => e.preventDefault()}
                                                className="cursor-pointer text-red-600 hover:!text-red-600 hover:!bg-red-50 dark:hover:!text-red-600 dark:hover:!bg-red-800/40 rounded-lg"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Remove from Storage
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <DeleteTokenModalContent
                                            tokenName={token?.name}
                                            onConfirm={handleRemoveFromStorage}
                                        />
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Token Overview */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold tracking-tight">Token Overview</h2>
                    <TokenOverview
                        token={token}
                        copied={copied}
                        onCopy={copyToClipboard}
                        refreshTrigger={supplyRefreshTrigger}
                    />
                </div>

                {/* Settings */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
                    <Tabs defaultValue="extensions" className="w-full">
                        <div className="w-full border-b-2 border-border">
                            <TabsList className="translate-y-0.5 w-full justify-start rounded-none h-auto p-0 bg-transparent space-x-6 ring-0">
                                <TabsTrigger
                                    value="permissions"
                                    className="cursor-pointer rounded-none border-b-2 border-transparent data-[state=active]:!border-b-primary dark:data-[state=active]:border-transparent data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    Permissions
                                </TabsTrigger>
                                <TabsTrigger
                                    value="blocklist"
                                    className="cursor-pointer rounded-none border-b-2 border-transparent data-[state=active]:!border-b-primary dark:data-[state=active]:border-transparent data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    {listType === 'allowlist' ? 'Allowlist' : 'Blocklist'}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="extensions"
                                    className="cursor-pointer rounded-none border-b-2 border-transparent data-[state=active]:!border-b-primary dark:data-[state=active]:border-transparent data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                >
                                    Extensions
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
                                    tokenSymbol={token.symbol}
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

            {/* Modals - ActionResultModal and AddressModal remain controlled (not user-triggered) */}
            <ActionResultModal
                isOpen={!!error || !!transactionSignature || actionInProgress}
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
        </div>
    );
}
