import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Trash2, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { WarningText } from '@/components/ui/warning-text';
import { TokenDisplay } from '@/types/token';
import { updateTokenAuthority, removeTokenAuthority } from '@/features/token-management/lib/authority';
import { getTokenAuthorities, type TokenAuthorities as BlockchainAuthorities } from '@/lib/solana/rpc';
import { AuthorityType } from 'gill/programs/token';
import { isAddress } from 'gill';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import { handleError } from '@/lib/errors';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/**
 * Supported authority roles in this component.
 * This is a subset of AuthorityType plus 'Metadata' for token metadata updates.
 */
type SupportedAuthorityRole =
    | typeof AuthorityType.MintTokens
    | typeof AuthorityType.FreezeAccount
    | typeof AuthorityType.Pause
    | typeof AuthorityType.ConfidentialTransferMint
    | typeof AuthorityType.PermanentDelegate
    | typeof AuthorityType.ScaledUiAmount
    | 'Metadata';

/**
 * Maps authority roles to their corresponding property keys in BlockchainAuthorities.
 * Used to look up the correct authority value from the blockchain response.
 */
const AUTHORITY_ROLE_TO_KEY: Record<SupportedAuthorityRole, keyof BlockchainAuthorities> = {
    [AuthorityType.MintTokens]: 'mintAuthority',
    [AuthorityType.FreezeAccount]: 'freezeAuthority',
    Metadata: 'metadataAuthority',
    [AuthorityType.Pause]: 'pausableAuthority',
    [AuthorityType.ConfidentialTransferMint]: 'confidentialBalancesAuthority',
    [AuthorityType.PermanentDelegate]: 'permanentDelegateAuthority',
    [AuthorityType.ScaledUiAmount]: 'scaledUiAmountAuthority',
};

interface TokenAuthoritiesProps {
    token: TokenDisplay;
    setError: (error: string) => void;
}

interface AuthorityInfo {
    label: string;
    description: string;
    role: SupportedAuthorityRole;
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
                            blockchainAuthorities[AUTHORITY_ROLE_TO_KEY[auth.role]] ?? auth.currentAuthority,
                    })),
                );
            } catch (error) {
                // Silently handles expected errors like "Mint account not found" or "Not a Token-2022 mint"
                // These indicate the token may not exist on this network - continue with local data
                handleError(error, setError, 'Failed to fetch authorities');
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
            handleError(error, setError, 'Failed to update authority');
        } finally {
            setAuthorities(prev => prev.map((auth, i) => (i === index ? { ...auth, isLoading: false } : auth)));
        }
    };

    const revokeAuthority = async (index: number) => {
        if (!token.address || !transactionSendingSigner) return;

        const authority = authorities[index];

        setAuthorities(prev => prev.map((auth, i) => (i === index ? { ...auth, isLoading: true } : auth)));

        try {
            const result = await removeTokenAuthority(
                {
                    mint: token.address,
                    role: authority.role,
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
                                  currentAuthority: undefined,
                                  isEditing: false,
                                  newAuthority: '',
                                  isLoading: false,
                              }
                            : auth,
                    ),
                );
            } else {
                setError(`Failed to revoke authority: ${result.error}`);
            }
        } catch (error) {
            handleError(error, setError, 'Failed to revoke authority');
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
                {filteredAuthorities.map(authority => {
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
                                                authority.isLoading || !validateSolanaAddress(authority.newAuthority)
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
                                    <WarningText
                                        show={
                                            !!authority.newAuthority && !validateSolanaAddress(authority.newAuthority)
                                        }
                                    >
                                        Please enter a valid Solana address
                                    </WarningText>
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
                                            disabled={!selectedAccount || authority.isLoading}
                                        >
                                            Edit
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-3 rounded-xl text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                                                    disabled={!selectedAccount || authority.isLoading}
                                                >
                                                    {authority.isLoading ? (
                                                        <Spinner size={14} />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="sm:rounded-2xl">
                                                <AlertDialogHeader>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                                                            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                                        </div>
                                                        <AlertDialogTitle>Revoke {authority.label}?</AlertDialogTitle>
                                                    </div>
                                                    <AlertDialogDescription className="text-left">
                                                        This action is <strong>irreversible</strong>. Once revoked, no
                                                        one will be able to perform actions that require this authority.
                                                        {authority.role === AuthorityType.MintTokens && (
                                                            <span className="block mt-2 text-red-600 dark:text-red-400">
                                                                Warning: Revoking mint authority means no more tokens
                                                                can ever be minted.
                                                            </span>
                                                        )}
                                                        {authority.role === AuthorityType.FreezeAccount && (
                                                            <span className="block mt-2 text-red-600 dark:text-red-400">
                                                                Warning: Revoking freeze authority means accounts can
                                                                never be frozen or unfrozen.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => revokeAuthority(originalIndex)}
                                                        className="rounded-xl bg-red-500 hover:bg-red-600 text-white"
                                                    >
                                                        Revoke Authority
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
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
