'use client';

import { useState, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RpcContext } from '@/context/RpcContext';
import { getTokenDashboardData, TokenType } from '@mosaic/sdk';
import { TokenStorage } from '@/lib/token/tokenStorage';
import { TokenDisplay } from '@/types/token';
import { Loader } from '@/components/ui/loader';
import { address, type Rpc, type SolanaRpcApi } from 'gill';

export default function ImportTokenPage() {
  const router = useRouter();
  const { rpc } = useContext(RpcContext);
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenType, setTokenType] = useState('none');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [importedTokenInfo, setImportedTokenInfo] = useState<{
    name: string;
    symbol: string;
    type: string;
  } | null>(null);

  const handleImport = async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Validate address format
      if (!tokenAddress || tokenAddress.length < 32) {
        throw new Error('Please enter a valid Solana token address');
      }

      // Convert string to Address type
      let mintAddress;
      try {
        mintAddress = address(tokenAddress);
      } catch {
        throw new Error('Invalid Solana address format');
      }

      // Fetch token data from blockchain
      const tokenData = await getTokenDashboardData(
        rpc as Rpc<SolanaRpcApi>,
        mintAddress
      );

      // Override type if user selected one
      if (tokenType !== 'none') {
        tokenData.type = tokenType as TokenType;
      }

      // Convert to TokenDisplay format for storage
      const tokenDisplay: TokenDisplay = {
        name: tokenData.name || 'Unknown Token',
        symbol: tokenData.symbol || 'UNKNOWN',
        address: tokenData.address,
        type: tokenData.type === 'unknown' ? undefined : tokenData.type,
        decimals: tokenData.decimals,
        supply: tokenData.supply,
        mintAuthority: tokenData.mintAuthority,
        metadataAuthority: tokenData.metadataAuthority,
        pausableAuthority: tokenData.pausableAuthority,
        confidentialBalancesAuthority: tokenData.confidentialBalancesAuthority,
        permanentDelegateAuthority: tokenData.permanentDelegateAuthority,
        scaledUiAmountAuthority: tokenData.scaledUiAmountAuthority,
        freezeAuthority: tokenData.freezeAuthority,
        extensions: tokenData.extensions,
        isSrfc37: tokenData.enableSrfc37,
        metadataUri: tokenData.uri,
        createdAt: new Date().toISOString(),
      };

      // Check if token already exists
      const existingToken = TokenStorage.findTokenByAddress(tokenData.address);
      if (existingToken) {
        const confirmUpdate = window.confirm(
          'This token already exists in your dashboard. Do you want to update it with the latest information?'
        );
        if (!confirmUpdate) {
          setIsLoading(false);
          return;
        }
      }

      // Save to local storage
      TokenStorage.saveToken(tokenDisplay);

      // Store info for success message
      setImportedTokenInfo({
        name: tokenDisplay.name || '',
        symbol: tokenDisplay.symbol || '',
        type: tokenDisplay.type || tokenData.type,
      });

      setSuccess(true);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      console.error('Error importing token:', err);

      // Provide user-friendly error messages
      let errorMessage = 'Failed to import token. ';

      if (err instanceof Error) {
        if (err.message.includes('not found')) {
          errorMessage += 'Token not found at the specified address.';
        } else if (err.message.includes('Invalid mint account')) {
          errorMessage += 'The address does not belong to a valid token mint.';
        } else if (err.message.includes('Token-2022')) {
          errorMessage +=
            'This appears to be a legacy SPL token. Import functionality only works for Token-2022 tokens.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Please check the address and try again.';
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard/create">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Create
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Import Existing Token</CardTitle>
            <CardDescription>
              Enter the address of an existing token to import it into the
              Mosaic platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="token-address">Token Address</Label>
              <Input
                id="token-address"
                type="text"
                placeholder="Enter token mint address..."
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value.trim())}
                disabled={isLoading || success}
              />
              <p className="text-sm text-muted-foreground">
                The Solana address of the token mint you want to import
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token-type">Token Type (Optional)</Label>
              <Select
                value={tokenType}
                onValueChange={setTokenType}
                disabled={isLoading || success}
              >
                <SelectTrigger id="token-type">
                  <SelectValue placeholder="Select a token type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / N/A</SelectItem>
                  <SelectItem value="stablecoin">Stablecoin</SelectItem>
                  <SelectItem value="arcade-token">Arcade Token</SelectItem>
                  <SelectItem value="tokenized-security">
                    Tokenized Security
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Optionally categorize this token for better organization
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && importedTokenInfo && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600 dark:text-green-400">
                  Successfully imported {importedTokenInfo.name} (
                  {importedTokenInfo.symbol})
                  {importedTokenInfo.type !== 'unknown' &&
                    ` as ${importedTokenInfo.type}`}
                  Redirecting to dashboard...
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4">
              <Button
                className="flex-1"
                disabled={!tokenAddress || isLoading || success}
                onClick={handleImport}
              >
                {isLoading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2" />
                    Importing...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Imported!
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Token
                  </>
                )}
              </Button>
              <Link href="/dashboard/create" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
