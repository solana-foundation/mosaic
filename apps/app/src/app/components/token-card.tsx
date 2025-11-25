import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink, RefreshCw, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TokenDisplay } from '@/types/token';
import { useConnector } from '@solana/connector/react';
import { getTokenSupply } from '@/lib/utils';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { type Address, createSolanaRpc } from 'gill';
import { IconHexagonFill } from 'symbols-react';

interface TokenCardProps {
    token: TokenDisplay;
    index: number;
    onDelete: (address: string) => void;
}

export function TokenCard({ token, index, onDelete }: TokenCardProps) {
    const { cluster } = useConnector();
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // Cleanup effect to ensure overlay and body styles are removed
    useEffect(() => {
        if (!isDeleteOpen) {
            // Reset body scroll lock
            document.body.style.pointerEvents = '';
            document.body.style.overflow = '';
        }
    }, [isDeleteOpen]);

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

    const handleDelete = () => {
        if (token.address) {
            onDelete(token.address);
            setIsDeleteOpen(false);
        }
    };

    return (
        <>
            <Card className="h-full flex flex-col rounded-[24px] border shadow-sm hover:shadow-md transition-all duration-200">
                <CardContent className="p-6 flex-1">
                    {/* Header: Logo and Status */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                            {/* Placeholder for logo - using hexagon icon */}
                            <IconHexagonFill className="h-6 w-6 fill-primary/50" width={24} height={24} />
                        </div>
                        <div className="flex-1"></div>
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-full font-normal text-xs"
                            >
                                Active
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
                                        onClick={() => setIsDeleteOpen(true)} 
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50 rounded-lg"
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
                            {token.name || `Token ${index + 1}`}
                        </h3>
                        <p className="text-md text-muted-foreground font-medium">${token.symbol || 'TKN'}</p>
                    </div>
                    {/* Details List */}
                    <div className="divide-y divide-primary/5">
                        <div className="flex items-center justify-between bg-primary/5 rounded-t-lg p-4">
                            <span className="text-muted-foreground text-sm font-medium">Type</span>
                            <Badge
                                variant="secondary"
                                className="bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 font-medium px-3 rounded-md"
                            >
                                {getTokenPatternsLabel(token.detectedPatterns)}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between bg-primary/5 p-4">
                            <span className="text-muted-foreground text-sm font-medium">Supply</span>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground text-sm">
                                    {isLoadingSupply ? 'Loading...' : formatSupply(currentSupply)}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={fetchSupply}
                                    disabled={isLoadingSupply}
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground rounded-full p-0"
                                >
                                    <RefreshCw className={`h-3 w-3 ${isLoadingSupply ? 'animate-spin' : ''}`} />
                                    <span className="sr-only">Refresh supply</span>
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-primary/5 rounded-b-lg p-4">
                            <span className="text-muted-foreground text-sm font-medium">Created</span>
                            <span className="font-semibold text-foreground text-sm">
                                {formatDate(token.createdAt)}
                            </span>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="p-6 pt-0">
                    <Link href={`/manage/${token.address}`} className="w-full">
                        <Button variant="default" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold h-11" size="lg">
                            Manage
                        </Button>
                    </Link>
                </CardFooter>
            </Card>

            <AlertDialog open={isDeleteOpen} onOpenChange={(open) => {
                setIsDeleteOpen(open);
                if (!open) {
                    // Force cleanup when closing
                    setTimeout(() => {
                        document.body.style.pointerEvents = '';
                        document.body.style.overflow = '';
                    }, 0);
                }
            }}>
                <AlertDialogContent className="rounded-[24px] p-4.5">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-bold">Delete Token from Storage</AlertDialogTitle>
                        <AlertDialogDescription className="text-md">
                            Are you sure you want to remove this token from your local list?
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* Warning box styled like card */}
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4">
                        <p className="text-sm text-red-900 dark:text-red-200">
                            <span className="font-semibold">Warning:</span> This action only removes the token from your local browser storage. The token will still exist on the blockchain, but you will need to import it again to manage it.
                        </p>
                    </div>

                    <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            className="w-full bg-destructive text-white hover:bg-destructive/90 rounded-xl font-semibold h-11"
                        >
                            Delete Token
                        </AlertDialogAction>
                        <AlertDialogCancel 
                            onClick={() => setIsDeleteOpen(false)}
                            className="w-full rounded-xl font-semibold h-11 mt-0"
                        >
                            Cancel
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
