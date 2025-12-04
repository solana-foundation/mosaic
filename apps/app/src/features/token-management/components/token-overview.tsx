import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { TokenDisplay } from '@/types/token';
import { useEffect, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useConnector } from '@solana/connector/react';
import { getTokenSupply } from '@/lib/utils';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { type Address, createSolanaRpc } from 'gill';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';

interface TokenOverviewProps {
    token: TokenDisplay;
    refreshTrigger?: number;
}

export interface TokenOverviewRef {
    refreshSupply: () => Promise<void>;
}

export const TokenOverview = forwardRef<TokenOverviewRef, TokenOverviewProps>(function TokenOverview(
    { token, refreshTrigger },
    ref,
) {
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

    // Refresh supply when trigger changes (after mint/burn actions)
    useEffect(() => {
        if (refreshTrigger !== undefined && refreshTrigger > 0) {
            fetchSupply();
        }
    }, [refreshTrigger, fetchSupply]);

    // Expose refreshSupply to parent components
    useImperativeHandle(
        ref,
        () => ({
            refreshSupply: fetchSupply,
        }),
        [fetchSupply],
    );

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Unknown';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatAddress = (address?: string) => {
        if (!address) return 'Unknown';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <Card>
            <CardContent className="p-6 px-8 rounded-[20px]">
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Token Address</span>
                        {token.address ? (
                            <CopyButton
                                textToCopy={token.address}
                                displayText={formatAddress(token.address)}
                                variant="ghost"
                                size="sm"
                                iconClassName="h-3 w-3"
                                iconClassNameCheck="h-3 w-3"
                            />
                        ) : (
                            <span className="font-mono text-sm">Unknown</span>
                        )}
                    </div>

                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Creation Address</span>
                        {token.mintAuthority || token.transactionSignature ? (
                            <CopyButton
                                textToCopy={token.mintAuthority || token.transactionSignature || ''}
                                displayText={formatAddress(token.mintAuthority || token.transactionSignature)}
                                variant="ghost"
                                size="sm"
                                iconClassName="h-3 w-3"
                                iconClassNameCheck="h-3 w-3"
                            />
                        ) : (
                            <span className="font-mono text-sm">Unknown</span>
                        )}
                    </div>

                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Supply</span>
                        <div className="flex items-center gap-2">
                            {isLoadingSupply ? (
                                <Spinner size={14} className="text-muted-foreground" />
                            ) : (
                                <>
                                    <span className="font-semibold">{currentSupply}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={fetchSupply}
                                        title="Refresh supply"
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Created</span>
                        <span className="font-semibold">{formatDate(token.createdAt)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Template</span>
                        <Badge variant="secondary" className="rounded-full">
                            {getTokenPatternsLabel(token.detectedPatterns)}
                        </Badge>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">Decimals</span>
                        <span className="font-semibold">{token.decimals || '6'}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});
