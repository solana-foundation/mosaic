import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { DeleteTokenModalContent } from './delete-token-modal';
import { TokenDisplay } from '@/types/token';
import { useConnector } from '@solana/connector/react';
import { getTokenSupply } from '@/lib/utils';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { buildAddressExplorerUrl } from '@/lib/solana/explorer';
import { type Address, createSolanaRpc } from 'gill';
import { IconHexagonFill } from 'symbols-react';
import { usePauseState, useTokenExtensionStore } from '@/stores/token-extension-store';

interface TokenCardProps {
    token: TokenDisplay;
    onDelete: (address: string) => void;
}

export function TokenCard({ token, onDelete }: TokenCardProps) {
    const { cluster } = useConnector();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const pendingDeleteRef = useRef(false);

    // Pause state for tokens with pausable extension
    const { isPaused } = usePauseState(token.address);
    const fetchPauseState = useTokenExtensionStore(state => state.fetchPauseState);

    // Create RPC client from current cluster
    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url);
    }, [cluster?.url]);
    const [currentSupply, setCurrentSupply] = useState<string>(token.supply || '0');
    const [isLoadingSupply, setIsLoadingSupply] = useState(false);

    const fetchSupply = useCallback(async () => {
        if (!token.address || !rpc) return;

        setIsLoadingSupply(true);
        try {
            const supply = await getTokenSupply(rpc, token.address as Address);
            setCurrentSupply(supply);
        } catch {
            // Silently handle errors and fall back to stored supply
            setCurrentSupply(token.supply || '0');
        } finally {
            setIsLoadingSupply(false);
        }
    }, [rpc, token.address, token.supply]);

    // Fetch supply on component mount
    useEffect(() => {
        fetchSupply();
    }, [fetchSupply]);

    // Fetch pause state for tokens with pausable extension
    useEffect(() => {
        if (token.address && token.pausableAuthority && cluster?.url) {
            fetchPauseState(token.address, cluster.url);
        }
    }, [token.address, token.pausableAuthority, cluster?.url, fetchPauseState]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Force cleanup body styles on unmount
            document.body.style.pointerEvents = '';
            document.body.style.overflow = '';
            document.body.style.removeProperty('pointer-events');
            document.body.style.removeProperty('overflow');
        };
    }, []);

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Unknown';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const formatSupply = (supply: string) => {
        const num = Number(supply);
        if (isNaN(num)) return supply;
        return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

    const handleDeleteClick = () => {
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (token.address) {
            pendingDeleteRef.current = true;
            setIsDeleteDialogOpen(false);
        }
    };

    const handleDialogOpenChange = (open: boolean) => {
        setIsDeleteDialogOpen(open);

        if (!open) {
            // Dialog is closing
            // Force cleanup body styles
            setTimeout(() => {
                document.body.style.pointerEvents = '';
                document.body.style.overflow = '';
                document.body.style.removeProperty('pointer-events');
                document.body.style.removeProperty('overflow');

                // If we're pending delete, do it after cleanup
                if (pendingDeleteRef.current && token.address) {
                    pendingDeleteRef.current = false;
                    onDelete(token.address);
                }
            }, 100);
        }
    };

    return (
        <>
            <Card className="h-full flex flex-col rounded-[24px] border shadow-sm hover:shadow-md transition-all duration-200">
                <CardContent className="p-6 flex-1">
                    {/* Header: Logo and Status */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10 overflow-hidden">
                            {token.image ? (
                                <img
                                    src={token.image}
                                    alt={token.name || 'Token'}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <IconHexagonFill className="h-6 w-6 fill-primary/50" width={24} height={24} />
                            )}
                        </div>
                        <div className="flex-1"></div>
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className={
                                    isPaused
                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 rounded-full font-normal text-xs'
                                        : 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-full font-normal text-xs'
                                }
                            >
                                {isPaused ? 'Paused' : 'Active'}
                            </Badge>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Open menu</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="p-1 rounded-xl" align="end">
                                    {token.address && (
                                        <DropdownMenuItem className="rounded-lg" asChild>
                                            <a
                                                href={buildAddressExplorerUrl(token.address, cluster)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="h-4 w-4 mr-2" />
                                                View on Explorer
                                            </a>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={handleDeleteClick}
                                        className="text-red-600 hover:!text-red-600 hover:!bg-red-50 dark:hover:!text-red-600 dark:hover:!bg-red-800/40 rounded-lg"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete from Storage
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Title: Name and Symbol */}
                    <div className="mb-4">
                        <h3 className="text-2xl font-bold text-foreground mb-1 leading-tight tracking-tight">
                            {token.name ||
                                (token.address
                                    ? `Token ${token.address.slice(0, 4)}...${token.address.slice(-4)}`
                                    : 'Token')}
                        </h3>
                        <p className="text-md text-muted-foreground font-medium">${token.symbol || 'TKN'}</p>
                    </div>
                    {/* Details List */}
                    <div className="divide-y divide-primary/5">
                        <div className="flex items-center justify-between bg-primary/5 rounded-t-lg p-4">
                            <span className="text-muted-foreground text-sm font-medium">Type</span>
                            <Badge
                                variant="secondary"
                                className="bg-primary/10 text-primary hover:bg-primary/[0.10] font-medium px-3 rounded-md"
                            >
                                {getTokenPatternsLabel(token.detectedPatterns)}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between bg-primary/5 p-4">
                            <span className="text-muted-foreground text-sm font-medium">Supply</span>
                            <span className="font-semibold text-foreground text-sm">
                                {isLoadingSupply ? 'Loading...' : formatSupply(currentSupply)}
                            </span>
                        </div>

                        <div className="flex items-center justify-between bg-primary/5 rounded-b-lg p-4">
                            <span className="text-muted-foreground text-sm font-medium">Created</span>
                            <span className="font-semibold text-foreground text-sm">{formatDate(token.createdAt)}</span>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="p-6 pt-0">
                    <Link href={`/manage/${token.address}`} className="w-full">
                        <Button
                            variant="default"
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold h-11"
                            size="lg"
                        >
                            Manage
                        </Button>
                    </Link>
                </CardFooter>
            </Card>

            {/* Delete confirmation dialog - rendered outside the card */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDialogOpenChange}>
                <DeleteTokenModalContent tokenName={token.name} onConfirm={handleDeleteConfirm} />
            </AlertDialog>
        </>
    );
}
