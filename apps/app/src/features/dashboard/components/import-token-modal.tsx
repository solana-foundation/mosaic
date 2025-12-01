'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle2 } from 'lucide-react';
import { useConnector } from '@solana/connector/react';
import { getTokenDashboardData, TokenType } from '@mosaic/sdk';
import { TokenDisplay } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { Spinner } from '@/components/ui/spinner';
import { address, createSolanaRpc, type Rpc, type SolanaRpcApi } from 'gill';
import { getTokenPatternsLabel } from '@/lib/token/token-type-utils';
import { cn } from '@/lib/utils';

interface ImportTokenModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onTokenImported?: () => void;
}

export function ImportTokenModal({ isOpen, onOpenChange, onTokenImported }: ImportTokenModalProps) {
    const { cluster, selectedAccount } = useConnector();
    const addToken = useTokenStore(state => state.addToken);
    const findTokenByAddress = useTokenStore(state => state.findTokenByAddress);

    // Create RPC client from current cluster
    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url);
    }, [cluster?.url]);

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
            // Validate RPC connection
            if (!rpc) {
                throw new Error('No RPC connection available. Please connect your wallet.');
            }

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
            const tokenData = await getTokenDashboardData(rpc as Rpc<SolanaRpcApi>, mintAddress);

            // Merge user-selected type with existing detected patterns
            if (tokenType !== 'none') {
                const selectedType = tokenType as TokenType;
                const existingPatterns = tokenData.detectedPatterns || [];
                if (!existingPatterns.includes(selectedType)) {
                    tokenData.detectedPatterns = [...existingPatterns, selectedType];
                }
            }

            // Convert to TokenDisplay format for storage
            const tokenDisplay: TokenDisplay = {
                name: tokenData.name || 'Unknown Token',
                symbol: tokenData.symbol || 'UNKNOWN',
                address: tokenData.address,
                detectedPatterns: tokenData.detectedPatterns,
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
                creatorWallet: selectedAccount || undefined,
            };

            // Check if token already exists
            const existingToken = findTokenByAddress(tokenData.address);
            if (existingToken) {
                const confirmUpdate = window.confirm(
                    'This token already exists in your dashboard. Do you want to update it with the latest information?',
                );
                if (!confirmUpdate) {
                    setIsLoading(false);
                    return;
                }
            }

            // Save to store (automatically persists to localStorage)
            addToken(tokenDisplay);

            // Store info for success message
            setImportedTokenInfo({
                name: tokenDisplay.name || '',
                symbol: tokenDisplay.symbol || '',
                type: getTokenPatternsLabel(tokenData.detectedPatterns),
            });

            setSuccess(true);

            // Call the parent callback to refresh the dashboard
            onTokenImported?.();

            // Close the modal after a short delay
            setTimeout(() => {
                handleClose();
            }, 2000);
        } catch (err) {
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

    const handleClose = () => {
        setTokenAddress('');
        setTokenType('none');
        setError(null);
        setSuccess(false);
        setImportedTokenInfo(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className={cn('sm:rounded-3xl p-0 gap-0 max-w-[500px] overflow-hidden')}>
                <div className="overflow-hidden">
                    <DialogHeader className="p-6 pb-4 border-b">
                        <DialogTitle className="text-xl font-semibold">Import Existing Token</DialogTitle>
                        <DialogDescription>
                            Enter the address of an existing token to import it into the Mosaic platform
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-5">
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
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                The Solana address of the token mint you want to import
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="token-type">Token Type (Optional)</Label>
                            <Select value={tokenType} onValueChange={setTokenType} disabled={isLoading || success}>
                                <SelectTrigger id="token-type">
                                    <SelectValue placeholder="Select a token type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None / N/A</SelectItem>
                                    <SelectItem value="stablecoin">Stablecoin</SelectItem>
                                    <SelectItem value="arcade-token">Arcade Token</SelectItem>
                                    <SelectItem value="tokenized-security">Tokenized Security</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Optionally categorize this token for better organization
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-200 dark:border-red-800">
                                {error}
                            </div>
                        )}

                        {success && importedTokenInfo && (
                            <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl p-5 space-y-3 border border-green-200 dark:border-green-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/50">
                                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                    </div>
                                    <span className="font-semibold text-green-700 dark:text-green-300">
                                        Successfully Imported
                                    </span>
                                </div>
                                <p className="text-sm text-green-700/80 dark:text-green-300/80 leading-relaxed">
                                    {importedTokenInfo.name} ({importedTokenInfo.symbol})
                                    {importedTokenInfo.type &&
                                        importedTokenInfo.type !== 'Unknown' &&
                                        ` as ${importedTokenInfo.type}`}
                                    . Closing...
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Button
                                variant="outline"
                                disabled={isLoading || success}
                                onClick={handleClose}
                                className="w-full h-12 rounded-xl mt-0"
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={!tokenAddress || isLoading || success}
                                onClick={handleImport}
                                className="w-full h-12 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                            >
                                {isLoading ? (
                                    <>
                                        <Spinner size={16} className="mr-2" />
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
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
