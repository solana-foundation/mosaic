import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Coins, Trash2, ExternalLink, RefreshCw, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenDisplay } from '@/types/token';
import { useConnector } from '@solana/connector/react';
import { getTokenSupply } from '@/lib/utils';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { type Address, createSolanaRpc } from 'gill';

interface TokenCardProps {
    token: TokenDisplay;
    index: number;
    onDelete: (address: string) => void;
}

export function TokenCard({ token, index, onDelete }: TokenCardProps) {
    const { cluster } = useConnector();

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

    return (
        <Card className="h-full flex flex-col rounded-[24px] border shadow-sm hover:shadow-md transition-all duration-200">
            <CardContent className="p-6 flex-1">
                {/* Header: Logo and Status */}
                <div className="flex items-start justify-between mb-6">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        {/* Placeholder for logo - using Coins icon */}
                        <Coins className="h-6 w-6 text-primary" />
                    </div>
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
                            <DropdownMenuContent align="end">
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
                                <DropdownMenuItem onClick={() => onDelete(token.address!)} className="text-red-600">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete from Storage
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Title: Name and Symbol */}
                <div className="mb-6">
                    <h3 className="text-2xl font-bold text-foreground mb-1 leading-tight tracking-tight">
                        {token.name || `Token ${index + 1}`}
                    </h3>
                    <p className="text-md text-muted-foreground font-medium">${token.symbol || 'TKN'}</p>
                </div>

                <Separator className="mb-6 bg-border/50" />

                {/* Details List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm font-medium">Type</span>
                        <Badge
                            variant="secondary"
                            className="bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 font-medium px-3 rounded-md"
                        >
                            {getTokenPatternsLabel(token.detectedPatterns)}
                        </Badge>
                    </div>

                    <div className="flex items-center justify-between">
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

                    <div className="flex items-center justify-between">
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
    );
}
