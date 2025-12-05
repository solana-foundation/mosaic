import { TokenDisplay } from '@/types/token';
import { useEffect, useState, useCallback, useMemo, useImperativeHandle, forwardRef, type ReactNode } from 'react';
import { useConnector } from '@solana/connector/react';
import { getTokenSupply } from '@/lib/utils';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { type Address, createSolanaRpc } from 'gill';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';

interface InfoRowProps {
    label: string;
    children: ReactNode;
}

function InfoRow({ label, children }: InfoRowProps) {
    return (
        <div className="flex justify-between items-center py-4 px-6 border-b last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}

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

    useEffect(() => {
        fetchSupply();
    }, [fetchSupply]);

    useEffect(() => {
        if (refreshTrigger !== undefined && refreshTrigger > 0) {
            fetchSupply();
        }
    }, [refreshTrigger, fetchSupply]);

    useEffect(() => {
        setCurrentSupply(token?.supply || '0');
    }, [token?.supply]);

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

    const formatSignature = (signature?: string) => {
        if (!signature) return 'Unknown';
        return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
    };

    return (
        <Card>
            <CardContent className="p-0 rounded-[20px]">
                <InfoRow label="Token Address">
                    {token.address ? (
                        <CopyButton
                            textToCopy={token.address}
                            displayText={formatAddress(token.address)}
                            variant="ghost"
                            size="sm"
                            iconClassName="h-3 w-3"
                            iconClassNameCheck="h-3 w-3"
                            className="font-berkeley-mono"
                        />
                    ) : (
                        <span className="font-mono text-sm">Unknown</span>
                    )}
                </InfoRow>

                {token.mintAuthority ? (
                    <InfoRow label="Creation Address">
                        <CopyButton
                            textToCopy={token.mintAuthority}
                            displayText={formatAddress(token.mintAuthority)}
                            variant="ghost"
                            size="sm"
                            iconClassName="h-3 w-3"
                            iconClassNameCheck="h-3 w-3"
                            className="font-berkeley-mono"
                        />
                    </InfoRow>
                ) : token.transactionSignature ? (
                    <InfoRow label="Creation Tx">
                        <CopyButton
                            textToCopy={token.transactionSignature}
                            displayText={formatSignature(token.transactionSignature)}
                            variant="ghost"
                            size="sm"
                            iconClassName="h-3 w-3"
                            iconClassNameCheck="h-3 w-3"
                            className="font-berkeley-mono"
                        />
                    </InfoRow>
                ) : (
                    <InfoRow label="Creation Address">
                        <span className="font-mono text-sm">Unknown</span>
                    </InfoRow>
                )}

                <InfoRow label="Supply">
                    {isLoadingSupply ? (
                        <Spinner size={14} className="text-muted-foreground" />
                    ) : (
                        <span className="font-semibold text-sm font-berkeley-mono px-2">{currentSupply}</span>
                    )}
                </InfoRow>

                <InfoRow label="Created">
                    <span className="font-semibold text-sm font-berkeley-mono px-2">{formatDate(token.createdAt)}</span>
                </InfoRow>

                <InfoRow label="Template">
                    <Badge variant="secondary" className="rounded-full">
                        {getTokenPatternsLabel(token.detectedPatterns)}
                    </Badge>
                </InfoRow>

                <InfoRow label="Decimals">
                    <span className="font-semibold text-sm font-berkeley-mono px-2">{token.decimals ?? 9}</span>
                </InfoRow>
            </CardContent>
        </Card>
    );
});
