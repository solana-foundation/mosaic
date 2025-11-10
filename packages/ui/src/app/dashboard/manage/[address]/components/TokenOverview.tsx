import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Copy, RefreshCw } from 'lucide-react';
import { TokenDisplay } from '@/types/token';
import { useContext, useEffect, useState, useCallback } from 'react';
import { RpcContext } from '@/context/RpcContext';
import { getTokenSupply } from '@/lib/utils';
import { getTokenTypeLabel, getTokenPatternsLabel } from '@/lib/token/tokenTypeUtils';
import { type Address } from 'gill';

interface TokenOverviewProps {
  token: TokenDisplay;
  copied: boolean;
  onCopy: (text: string) => void;
}

export function TokenOverview({ token, copied, onCopy }: TokenOverviewProps) {
  const { rpc } = useContext(RpcContext);
  const [currentSupply, setCurrentSupply] = useState<string>(
    token.supply || '0'
  );
  const [isLoadingSupply, setIsLoadingSupply] = useState(false);

  const fetchSupply = useCallback(async () => {
    if (!token.address) return;

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
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Coins className="h-5 w-5 mr-2" />
          Token Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <p className="text-lg font-semibold">{token.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Symbol
            </label>
            <p className="text-lg font-semibold">{token.symbol}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Supply
            </label>
            <div className="flex items-center space-x-2">
              <p className="text-lg font-semibold">
                {isLoadingSupply ? 'Loading...' : currentSupply}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSupply}
                disabled={isLoadingSupply}
                className="h-6 w-6 p-0"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isLoadingSupply ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Decimals
            </label>
            <p className="text-lg font-semibold">{token.decimals || '6'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Type
            </label>
            <div className="space-y-1">
              <p className="text-lg font-semibold">
                {getTokenPatternsLabel(token.type, token.detectedPatterns)}
              </p>
              {token.detectedPatterns && token.detectedPatterns.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {token.detectedPatterns.map((pattern, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                    >
                      {getTokenTypeLabel(pattern)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Created
            </label>
            <p className="text-lg font-semibold">
              {formatDate(token.createdAt)}
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Token Address
          </label>
          <div className="flex items-start space-x-2 mt-1">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
              {token.address}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy(token.address || '')}
              className="flex-shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copied && (
            <p className="text-sm text-green-600 mt-1">Copied to clipboard!</p>
          )}
        </div>

        {token.transactionSignature && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Creation Transaction
            </label>
            <div className="flex items-start space-x-2 mt-1">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                {token.transactionSignature}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopy(token.transactionSignature || '')}
                className="flex-shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {token.metadataUri && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Metadata URI
            </label>
            <p className="text-sm bg-muted px-3 py-2 rounded mt-1">
              {token.metadataUri}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
