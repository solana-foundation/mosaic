import { useContext, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Settings, Coins, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenDisplay } from '@/types/token';
import { RpcContext } from '@/context/RpcContext';
import { getTokenSupply } from '@/lib/utils';
import { type Address } from 'gill';

interface TokenCardProps {
  token: TokenDisplay;
  index: number;
  onDelete: (address: string) => void;
}

export function TokenCard({ token, index, onDelete }: TokenCardProps) {
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

  const getTokenTypeLabel = (type?: string) => {
    switch (type) {
      case 'stablecoin':
        return 'Stablecoin';
      case 'arcade-token':
        return 'Arcade Token';
      default:
        return type || 'Unknown';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Coins className="h-6 w-6 text-primary mr-3" />
            <div>
              <CardTitle className="text-lg">
                {token.name || `Token ${index + 1}`}
              </CardTitle>
              <CardDescription>{token.symbol || 'TKN'}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/manage/${token.address}`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Manage
                </Link>
              </DropdownMenuItem>
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
              <DropdownMenuItem
                onClick={() => onDelete(token.address!)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete from Storage
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type:</span>
            <span className="font-medium">{getTokenTypeLabel(token.type)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Supply:</span>
            <div className="flex items-center space-x-1">
              <span>{isLoadingSupply ? 'Loading...' : currentSupply}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSupply}
                disabled={isLoadingSupply}
                className="h-4 w-4 p-0"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isLoadingSupply ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Decimals:</span>
            <span>{token.decimals || '6'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created:</span>
            <span>{formatDate(token.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <span className="text-green-600">Active</span>
          </div>
          {token.extensions && token.extensions.length > 0 && (
            <div className="pt-2">
              <span className="text-muted-foreground text-xs">Extensions:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {token.extensions.slice(0, 2).map((ext, idx) => (
                  <span
                    key={idx}
                    className="px-1 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                  >
                    {ext}
                  </span>
                ))}
                {token.extensions.length > 2 && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    +{token.extensions.length - 2} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Link href={`/dashboard/manage/${token.address}`} className="w-full">
          <Button variant="outline" className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            Manage
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
