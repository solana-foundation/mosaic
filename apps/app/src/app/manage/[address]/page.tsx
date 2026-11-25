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
    Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenDisplay } from '@/types/token';
import { Spinner } from '@/components/ui/spinner';
import { useConnector } from '@solana/connector/react';
import { useTokenStore } from '@/stores/token-store';
import { useTokenExtensionStore, usePauseState } from '@/stores/token-extension-store';
import { humanizeError } from '@/lib/errors';
import { TokenOverview } from '@/features/token-management/components/token-overview';
import { TokenAuthorities } from '@/features/token-management/components/token-authorities';
import { TokenExtensions } from '@/features/token-management/components/token-extensions';
import { TransferRestrictions } from '@/features/token-management/components/transfer-restrictions';
import { AddressModal } from '@/features/token-management/components/modals/address-modal';
import { MintModalContent } from '@/features/token-management/components/modals/mint-modal-refactored';
import { ForceTransferModalContent } from '@/features/token-management/components/modals/force-transfer-modal-refactored';
import { ForceBurnModalContent } from '@/features/token-management/components/modals/force-burn-modal-refactored';
import { ActionResultModal } from '@/features/token-management/components/modals/action-result-modal';
import { PauseConfirmModalContent } from '@/features/token-management/components/modals/pause-confirm-modal';
import { FreezeThawModalContent } from '@/features/token-management/components/modals/freeze-thaw-modal';
import { TransferModalContent } from '@/features/token-management/components/modals/transfer-modal';
import { BurnModalContent } from '@/features/token-management/components/modals/burn-modal';
import { UpdateMetadataModalContent } from '@/features/token-management/components/modals/update-metadata-modal';
import { CloseAccountModalContent } from '@/features/token-management/components/modals/close-account-modal';
import { DeleteTokenModalContent } from '@/features/dashboard/components/delete-token-modal';
import { ImportTokenModal } from '@/features/dashboard/components/import-token-modal';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import {
    addAddressToBlocklist,
    addAddressToAllowlist,
    removeAddressFromBlocklist,
    removeAddressFromAllowlist,
    readAccessListState,
} from '@/features/token-management/lib/access-list';
import {
    type AccessListState,
    type ReadyAccessListState,
    shortAddress,
} from '@/features/token-management/lib/access-list-state';
import { Address, createSolanaRpc, Rpc, SolanaRpcApi } from '@solana/kit';
import { getTokenDashboardData, getTokenExtensions } from '@solana/mosaic-sdk';
import { buildAddressExplorerUrl } from '@/lib/solana/explorer';
import { getTokenAuthorities } from '@/lib/solana/rpc';
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

function ManageTokenConnected({ address }: { address: string }) {
    const router = useRouter();
    const { selectedAccount, cluster } = useConnector();
    const findTokenByAddress = useTokenStore(state => state.findTokenByAddress);
    const removeToken = useTokenStore(state => state.removeToken);
    const updateToken = useTokenStore(state => state.updateToken);
    const [token, setToken] = useState<TokenDisplay | null>(null);
    const [loading, setLoading] = useState(true);
    // The sRFC-37 list attached to the mint, read from chain (not derived from the connected wallet).
    const [accessListState, setAccessListState] = useState<AccessListState>({ status: 'loading' });
    const accessList: string[] = accessListState.status === 'ready' ? accessListState.wallets : [];
    const listLabel =
        accessListState.status === 'ready'
            ? accessListState.mode === 'allowlist'
                ? 'Allowlist'
                : 'Blocklist'
            : 'Access List';
    const [newAddress, setNewAddress] = useState('');
    const [showAccessListModal, setShowAccessListModal] = useState(false);
    const [actionInProgress, setActionInProgress] = useState(false);
    const [error, setError] = useState('');
    const [transactionSignature, setTransactionSignature] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [supplyRefreshTrigger, setSupplyRefreshTrigger] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const importedMintRef = useRef<string | null>(null);

    // Use centralized extension store for pause state
    const { isPaused, isUpdating: isPauseUpdating, error: pauseError } = usePauseState(address);
    const { fetchPauseState, togglePause, updateExtensionField, syncTransferHookProgramId, syncScaledUiMultiplier } =
        useTokenExtensionStore();

    // Function to trigger supply refresh after mint/burn actions
    const refreshSupply = () => {
        setSupplyRefreshTrigger(prev => prev + 1);
    };

    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url) as Rpc<SolanaRpcApi>;
    }, [cluster?.url]);

    // Re-read the list after a write; the current state stays on screen until the new read lands.
    const refreshAccessList = () => {
        setTimeout(() => {
            setRefreshTrigger(prev => prev + 1);
        }, 600);
    };

    const retryAccessList = () => {
        setAccessListState({ status: 'loading' });
        setRefreshTrigger(prev => prev + 1);
    };

    // Use the connector signer hook which provides a kit-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    useEffect(() => {
        const addTokenExtensionsToFoundToken = async (foundToken: TokenDisplay): Promise<void> => {
            if (!rpc) return;

            // Live on-chain extension rates, fetched in parallel; a failure keeps the persisted values
            const dashboardReadStartedAt = Date.now();
            const dashboardDataPromise = getTokenDashboardData(rpc, foundToken.address as Address).catch(() => null);
            // Applied on both paths below, so a successful rate read isn't lost to a failed extension read
            const applyDashboardData = async (): Promise<void> => {
                const dashboardData = await dashboardDataPromise;
                if (!dashboardData) return;
                foundToken.transferFeeBasisPoints = dashboardData.transferFeeBasisPoints;
                foundToken.transferFeeMaximum = dashboardData.transferFeeMaximum;
                foundToken.interestRate = dashboardData.interestRate;
                foundToken.scaledUiMultiplier = dashboardData.multiplier;
                foundToken.scaledUiNewMultiplier = dashboardData.scaledUiNewMultiplier;
                foundToken.scaledUiNewMultiplierEffectiveTimestamp =
                    dashboardData.scaledUiNewMultiplierEffectiveTimestamp;
                // The fresh chain read supersedes a multiplier saved earlier from the extensions panel
                syncScaledUiMultiplier(foundToken.address as string, dashboardReadStartedAt);
            };

            try {
                const extensions = await getTokenExtensions(rpc, foundToken.address as Address);
                foundToken.extensions = extensions;

                // Fetch authority information from the blockchain
                try {
                    const rpcUrl =
                        cluster?.url ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
                    const authorities = await getTokenAuthorities(foundToken.address as Address, rpcUrl);
                    // Merge fetched authorities into the token, preserving existing values if they exist
                    foundToken.mintAuthority = authorities.mintAuthority || foundToken.mintAuthority;
                    foundToken.freezeAuthority = authorities.freezeAuthority || foundToken.freezeAuthority;
                    foundToken.metadataAuthority = authorities.metadataAuthority || foundToken.metadataAuthority;
                    foundToken.pausableAuthority = authorities.pausableAuthority || foundToken.pausableAuthority;
                    foundToken.confidentialBalancesAuthority =
                        authorities.confidentialBalancesAuthority || foundToken.confidentialBalancesAuthority;
                    foundToken.permanentDelegateAuthority =
                        authorities.permanentDelegateAuthority || foundToken.permanentDelegateAuthority;
                    foundToken.scaledUiAmountAuthority =
                        authorities.scaledUiAmountAuthority || foundToken.scaledUiAmountAuthority;
                    // Chain data is authoritative here: no local fallback, or a revoked
                    // authority would keep showing the stale address.
                    foundToken.transferHookAuthority = authorities.transferHookAuthority;
                    foundToken.transferHookProgramId = authorities.transferHookProgramId;
                    // The locally stored token never carries the hook program id, so the
                    // extensions panel reads it from the store, synced only from chain data.
                    syncTransferHookProgramId(foundToken.address as string, authorities.transferHookProgramId ?? null);
                } catch (error) {
                    // If authority fetch fails, continue with existing token data
                    // Authorities may not be available if token doesn't exist on this network.
                    // Flag the transfer hook state so its card offers a retry instead of loading forever.
                    updateExtensionField(foundToken.address as string, 'transferHook', {
                        error: humanizeError(error, 'Failed to load transfer hook state'),
                    });
                }

                await applyDashboardData();
                // A new object, since foundToken is already in state and was mutated in place
                setToken({ ...foundToken });

                // Fetch pause state using centralized store
                if (foundToken.address) {
                    fetchPauseState(foundToken.address, cluster?.url || '');
                }
            } catch {
                // Token might not exist on this network - show the token with empty extensions
                await applyDashboardData();
                setToken({ ...foundToken });
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
    }, [
        address,
        rpc,
        cluster?.url,
        findTokenByAddress,
        fetchPauseState,
        syncTransferHookProgramId,
        syncScaledUiMultiplier,
        updateExtensionField,
        reloadKey,
    ]);

    // A different wallet, mint or cluster must not show the previous read while the new one loads.
    const accessListKey = `${selectedAccount}-${token?.address}-${cluster?.url}`;
    const [loadedAccessListKey, setLoadedAccessListKey] = useState(accessListKey);
    if (loadedAccessListKey !== accessListKey) {
        setLoadedAccessListKey(accessListKey);
        setAccessListState({ status: 'loading' });
    }

    useEffect(() => {
        if (!rpc || !token?.address || !token?.isSrfc37) return;

        let cancelled = false;
        readAccessListState(rpc, token.address as Address, (selectedAccount as Address | undefined) ?? null).then(
            state => {
                if (!cancelled) setAccessListState(state);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [rpc, selectedAccount, token?.address, token?.isSrfc37, refreshTrigger]);

    const openInExplorer = () => {
        window.open(buildAddressExplorerUrl(address, cluster), '_blank');
    };

    // Writes go through the SDK, which derives the list from the signer, so only the authority of
    // the attached list may write. Returns that list, or reports why the wallet can't change it.
    const manageableAccessList = (): ReadyAccessListState | null => {
        if (accessListState.status === 'ready' && accessListState.canManage) return accessListState;
        setError(
            accessListState.status === 'ready'
                ? `Only the list authority ${shortAddress(accessListState.authority)} can change this list.`
                : "Only the list authority can change this list, and this token's list hasn't been read.",
        );
        return null;
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
        const list = manageableAccessList();
        if (!list) return;

        setActionInProgress(true);
        setError('');

        try {
            let result;
            if (list.mode === 'blocklist') {
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
        const list = manageableAccessList();
        if (!list) return;

        setActionInProgress(true);
        setError('');

        try {
            if (!transactionSendingSigner) {
                throw new Error('Transaction signer not available');
            }

            let result;
            if (list.mode === 'blocklist') {
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
            updateExtensionField(address, 'pause', { error: 'Required parameters not available' });
            return;
        }

        // Check if the connected wallet has pause authority
        const walletAddress = String(selectedAccount);
        const pauseAuthority = token.pausableAuthority ? String(token.pausableAuthority) : '';

        if (pauseAuthority && pauseAuthority !== walletAddress) {
            updateExtensionField(address, 'pause', {
                error: 'Connected wallet does not have pause authority. Only the pause authority can pause/unpause this token.',
            });
            return;
        }

        // Use centralized store to toggle pause
        await togglePause(
            token.address,
            {
                pauseAuthority: token.pausableAuthority,
                feePayer: selectedAccount,
                rpcUrl: cluster?.url || '',
            },
            transactionSendingSigner,
        );
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
                            The token with address {address} isn&apos;t in this browser&apos;s dashboard yet. Import it
                            to load it from chain.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <Button onClick={() => setIsImportOpen(true)}>
                                <Upload className="h-4 w-4 mr-2" />
                                Import this token
                            </Button>
                            <Link href="/">
                                <Button variant="outline">
                                    <ChevronLeft className="h-4 w-4 mr-2" />
                                    Back to Dashboard
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Act only once the modal has closed after a success: reloading on import would
                    swap this not-found screen for the token view and unmount the open dialog. If the
                    user edited the prefilled address, go to the mint they actually imported. */}
                <ImportTokenModal
                    isOpen={isImportOpen}
                    initialAddress={address}
                    onTokenImported={mintAddress => {
                        importedMintRef.current = mintAddress;
                    }}
                    onOpenChange={open => {
                        setIsImportOpen(open);
                        const importedMint = importedMintRef.current;
                        if (!open && importedMint) {
                            importedMintRef.current = null;
                            if (importedMint === address) {
                                setReloadKey(k => k + 1);
                            } else {
                                router.push(`/manage/${importedMint}`);
                            }
                        }
                    }}
                />
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
                            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10 overflow-hidden">
                                {token.image ? (
                                    <img
                                        src={token.image}
                                        alt={token.name || 'Token'}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <IconHexagonFill className="h-6 w-6 fill-primary/50" width={32} height={32} />
                                )}
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
                                    <DropdownMenuLabel className="text-primary/30 text-xs">
                                        Token Actions
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {transactionSendingSigner && (
                                        <>
                                            {token?.mintAuthority && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-lg"
                                                            onSelect={e => e.preventDefault()}
                                                        >
                                                            <Coins className="h-4 w-4 mr-2 text-primary/30" />
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
                                            )}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <Send className="h-4 w-4 mr-2 text-primary/30" />
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
                                                        <Flame className="h-4 w-4 mr-2 text-primary/30" />
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
                                            {token?.metadataAuthority && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-lg"
                                                            onSelect={e => e.preventDefault()}
                                                        >
                                                            <FileText className="h-4 w-4 mr-2 text-primary/30" />
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
                                                        onSuccess={updates => {
                                                            updateToken(address, {
                                                                ...(updates.name && { name: updates.name }),
                                                                ...(updates.symbol && { symbol: updates.symbol }),
                                                                ...(updates.uri && { metadataUri: updates.uri }),
                                                            });
                                                            // Also update local state for immediate UI feedback
                                                            setToken(prev =>
                                                                prev
                                                                    ? {
                                                                          ...prev,
                                                                          ...(updates.name && { name: updates.name }),
                                                                          ...(updates.symbol && {
                                                                              symbol: updates.symbol,
                                                                          }),
                                                                          ...(updates.uri && {
                                                                              metadataUri: updates.uri,
                                                                          }),
                                                                      }
                                                                    : prev,
                                                            );
                                                        }}
                                                    />
                                                </AlertDialog>
                                            )}
                                            {token?.permanentDelegateAuthority && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuLabel className="text-primary/30 text-xs">
                                                        Administrative Actions
                                                    </DropdownMenuLabel>
                                                    <DropdownMenuSeparator />

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem
                                                                className="cursor-pointer rounded-lg"
                                                                onSelect={e => e.preventDefault()}
                                                            >
                                                                <ArrowRightLeft className="h-4 w-4 mr-2 text-primary/30" />
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
                                                                <Flame className="h-4 w-4 mr-2 text-primary/30" />
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
                                                </>
                                            )}
                                            {token?.freezeAuthority && (
                                                <>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem
                                                                className="cursor-pointer rounded-lg"
                                                                onSelect={e => e.preventDefault()}
                                                            >
                                                                <Snowflake className="h-4 w-4 mr-2 text-primary/30" />
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
                                                                <Sun className="h-4 w-4 mr-2 text-primary/30" />
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
                                                </>
                                            )}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer rounded-lg"
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2 text-primary/30" />
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
                                    {token?.pausableAuthority && (
                                        <>
                                            <AlertDialog
                                                onOpenChange={open => {
                                                    if (!open) {
                                                        updateExtensionField(address, 'pause', { error: null });
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
                                                                <Coins className="h-4 w-4 mr-2 text-primary/30" />{' '}
                                                                Unpause Token
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Ban className="h-4 w-4 mr-2 text-primary/30" /> Pause
                                                                Token
                                                            </>
                                                        )}
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <PauseConfirmModalContent
                                                    onConfirm={handlePauseConfirm}
                                                    isPaused={isPaused}
                                                    tokenName={token?.name || 'Token'}
                                                    isLoading={isPauseUpdating}
                                                    error={pauseError ?? undefined}
                                                />
                                            </AlertDialog>
                                        </>
                                    )}
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
                    <TokenOverview token={token} refreshTrigger={supplyRefreshTrigger} />
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
                                {token.isSrfc37 && (
                                    <TabsTrigger
                                        value="blocklist"
                                        className="cursor-pointer rounded-none border-b-2 border-transparent data-[state=active]:!border-b-primary dark:data-[state=active]:border-transparent data-[state=active]:shadow-none px-0 py-3 bg-transparent data-[state=active]:bg-transparent"
                                    >
                                        {listLabel}
                                    </TabsTrigger>
                                )}
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
                            {token.isSrfc37 && (
                                <TabsContent value="blocklist">
                                    <TransferRestrictions
                                        state={accessListState}
                                        tokenSymbol={token.symbol}
                                        onAddToAccessList={() => setShowAccessListModal(true)}
                                        onRemoveFromAccessList={removeFromAccessList}
                                        onRetry={retryAccessList}
                                    />
                                </TabsContent>
                            )}
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

            {accessListState.status === 'ready' && accessListState.canManage && (
                <AddressModal
                    isOpen={showAccessListModal}
                    onClose={() => {
                        setShowAccessListModal(false);
                        setNewAddress('');
                    }}
                    onAdd={addToAccessList}
                    newAddress={newAddress}
                    onAddressChange={setNewAddress}
                    title={`Add to ${listLabel}`}
                    placeholder="Enter Solana address..."
                    buttonText={`Add to ${listLabel}`}
                />
            )}
        </div>
    );
}
