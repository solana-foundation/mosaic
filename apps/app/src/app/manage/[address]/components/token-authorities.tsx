import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { TokenDisplay } from '@/types/token';
import { updateTokenAuthority } from '@/lib/management/authority';
import { getTokenAuthorities } from '@/lib/solana/rpc';
import { AuthorityType } from 'gill/programs/token';
import { isAddress } from 'gill';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/hooks/use-connector-signer';

interface TokenAuthoritiesProps {
    token: TokenDisplay;
    setError: (error: string) => void;
}

interface AuthorityInfo {
    label: string;
    description: string;
    role: AuthorityType | 'Metadata';
    currentAuthority?: string;
    isEditing: boolean;
    newAuthority: string;
    isLoading: boolean;
}

export function TokenAuthorities({ setError, token }: TokenAuthoritiesProps) {
    // Create base authorities array with descriptions
    const baseAuthorities: AuthorityInfo[] = [
        {
            label: 'Mint Authority',
            description: 'This wallet can create new tokens.',
            role: AuthorityType.MintTokens,
            currentAuthority: token.mintAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Freeze Authority',
            description: 'This wallet can freeze and unfreeze token accounts.',
            role: AuthorityType.FreezeAccount,
            currentAuthority: token.freezeAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Metadata Authority',
            description: 'This wallet can update token metadata.',
            role: 'Metadata',
            currentAuthority: token.metadataAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Pausable Authority',
            description: 'This wallet can pause and unpause all token transfers.',
            role: AuthorityType.Pause,
            currentAuthority: token.pausableAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Confidential Balances Authority',
            description: 'This wallet can manage confidential transfer settings.',
            role: AuthorityType.ConfidentialTransferMint,
            currentAuthority: token.confidentialBalancesAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Permanent Delegate Authority',
            description: 'This wallet can transfer or burn tokens from any account.',
            role: AuthorityType.PermanentDelegate,
            currentAuthority: token.permanentDelegateAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
        {
            label: 'Scaled UI Amount Authority',
            description: 'This wallet can update the token display multiplier.',
            role: AuthorityType.ScaledUiAmount,
            currentAuthority: token.scaledUiAmountAuthority,
            isEditing: false,
            newAuthority: '',
            isLoading: false,
        },
    ];

    const [authorities, setAuthorities] = useState<AuthorityInfo[]>(baseAuthorities);
    const [isLoadingAuthorities, setIsLoadingAuthorities] = useState(false);
    const { selectedAccount, cluster } = useConnector();

    // Get RPC URL from the current cluster
    const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    // Use the connector signer hook which provides a gill-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    // Fetch current authorities from blockchain
    useEffect(() => {
        const fetchAuthorities = async () => {
            if (!token.address) return;

            setIsLoadingAuthorities(true);
            try {
                const blockchainAuthorities = await getTokenAuthorities(token.address, rpcUrl);

                setAuthorities(prev =>
                    prev.map(auth => ({
                        ...auth,
                        currentAuthority:
                            auth.role === AuthorityType.MintTokens
                                ? blockchainAuthorities.mintAuthority
                                : auth.role === AuthorityType.FreezeAccount
                                  ? blockchainAuthorities.freezeAuthority
                                  : auth.role === 'Metadata'
                                    ? blockchainAuthorities.metadataAuthority
                                    : auth.role === AuthorityType.Pause
                                      ? blockchainAuthorities.pausableAuthority
                                      : auth.role === AuthorityType.ConfidentialTransferMint
                                        ? blockchainAuthorities.confidentialBalancesAuthority
                                        : auth.role === AuthorityType.PermanentDelegate
                                          ? blockchainAuthorities.permanentDelegateAuthority
                                          : auth.role === AuthorityType.ScaledUiAmount
                                            ? blockchainAuthorities.scaledUiAmountAuthority
                                            : auth.currentAuthority,
                    })),
                );
            } catch (error) {
                // Silently handle "Mint account not found" - the token may not exist on this network
                // Just use the local data we already have from the token prop
                const errorMessage = error instanceof Error ? error.message : '';
                if (!errorMessage.includes('Mint account not found') && !errorMessage.includes('Not a Token-2022 mint')) {
                    setError(errorMessage || 'Failed to fetch authorities');
                }
                // Otherwise, just log and continue with local data
                console.warn('Failed to fetch authorities from blockchain:', errorMessage);
            } finally {
                setIsLoadingAuthorities(false);
            }
        };

        fetchAuthorities();
    }, [token.address, rpcUrl, setError]);

    const startEditing = (index: number) => {
        setAuthorities(prev =>
            prev.map((auth, i) =>
                i === index
                    ? {
                          ...auth,
                          isEditing: true,
                          newAuthority: auth.currentAuthority || '',
                      }
                    : auth,
            ),
        );
    };

    const cancelEditing = (index: number) => {
        setAuthorities(prev =>
            prev.map((auth, i) => (i === index ? { ...auth, isEditing: false, newAuthority: '' } : auth)),
        );
    };

    const updateAuthority = async (index: number) => {
        if (!token.address || !transactionSendingSigner) return;

        const authority = authorities[index];
        if (!authority.newAuthority.trim()) return;

        setAuthorities(prev => prev.map((auth, i) => (i === index ? { ...auth, isLoading: true } : auth)));

        try {
            const result = await updateTokenAuthority(
                {
                    mint: token.address,
                    role: authority.role,
                    newAuthority: authority.newAuthority.trim(),
                    rpcUrl,
                },
                transactionSendingSigner,
            );

            if (result.success) {
                setAuthorities(prev =>
                    prev.map((auth, i) =>
                        i === index
                            ? {
                                  ...auth,
                                  currentAuthority: authority.newAuthority.trim(),
                                  isEditing: false,
                                  newAuthority: '',
                                  isLoading: false,
                              }
                            : auth,
                    ),
                );
            } else {
                setError(`Failed to update authority: ${result.error}`);
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to update authority');
        } finally {
            setAuthorities(prev => prev.map((auth, i) => (i === index ? { ...auth, isLoading: false } : auth)));
        }
    };

    const validateSolanaAddress = (address: string) => {
        return isAddress(address);
    };

    const truncateAddress = (address: string) => {
        return `${address.slice(0, 8)}... ${address.slice(-7)}`;
    };

    const filteredAuthorities = authorities.filter(authority => authority.currentAuthority);

    if (isLoadingAuthorities) {
        return (
            <div className="rounded-2xl border bg-card p-8 flex items-center justify-center">
                <Spinner size={24} className="text-muted-foreground" />
            </div>
        );
    }

    if (filteredAuthorities.length === 0) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                No authorities configured for this token.
            </div>
        );
    }

    return (
        <div className="rounded-3xl border bg-card overflow-hidden">
            <div className="divide-y divide-border">
                {filteredAuthorities.map((authority) => {
                    const originalIndex = authorities.findIndex(a => a.role === authority.role);
                    
                    return (
                        <div key={authority.role} className="p-5">
                            {authority.isEditing ? (
                                // Edit mode
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="font-semibold text-foreground">{authority.label}</h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">{authority.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Enter new authority address"
                                            value={authority.newAuthority}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setAuthorities(prev =>
                                                    prev.map((auth, i) =>
                                                        i === originalIndex
                                                            ? { ...auth, newAuthority: e.target.value }
                                                            : auth,
                                                    ),
                                                )
                                            }
                                            className="flex-1 h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        />
                                        <Button
                                            size="sm"
                                            className="h-10 px-4 rounded-xl"
                                            onClick={() => updateAuthority(originalIndex)}
                                            disabled={
                                                authority.isLoading ||
                                                !validateSolanaAddress(authority.newAuthority)
                                            }
                                        >
                                            {authority.isLoading ? (
                                                <Spinner size={16} />
                                            ) : (
                                                <Check className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-10 px-4 rounded-xl"
                                            onClick={() => cancelEditing(originalIndex)}
                                            disabled={authority.isLoading}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {authority.newAuthority &&
                                        !validateSolanaAddress(authority.newAuthority) && (
                                            <p className="text-sm text-red-500">
                                                Please enter a valid Solana address
                                            </p>
                                        )}
                                </div>
                            ) : (
                                // View mode
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-foreground">{authority.label}</h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">{authority.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="px-3 py-2 bg-muted rounded-xl font-mono text-sm">
                                            {truncateAddress(authority.currentAuthority!)}
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-9 px-4 rounded-xl"
                                            onClick={() => startEditing(originalIndex)}
                                            disabled={!selectedAccount}
                                        >
                                            Edit
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!selectedAccount && (
                <div className="border-t p-4 bg-amber-50 dark:bg-amber-950/30">
                    <p className="text-sm text-amber-700 dark:text-amber-300 text-center">
                        Connect your wallet to manage authorities
                    </p>
                </div>
            )}
        </div>
    );
}
