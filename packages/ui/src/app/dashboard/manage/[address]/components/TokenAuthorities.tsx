import { useState, useEffect, useContext } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Edit,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TokenDisplay } from '@/types/token';
import { updateTokenAuthority } from '@/lib/management/authority';
import { getTokenAuthorities } from '@/lib/solana/rpc';
import { AuthorityType } from 'gill/programs/token';
import { isAddress } from 'gill';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';
import { ChainContext } from '@/context/ChainContext';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';

interface TokenAuthoritiesProps {
  token: TokenDisplay;
  setError: (error: string) => void;
}

interface AuthorityInfo {
  label: string;
  role: AuthorityType | 'Metadata';
  currentAuthority?: string;
  isEditing: boolean;
  newAuthority: string;
  isLoading: boolean;
}

export function TokenAuthorities({ setError, token }: TokenAuthoritiesProps) {
  // Create base authorities array
  const baseAuthorities: AuthorityInfo[] = [
    {
      label: 'Mint Authority',
      role: AuthorityType.MintTokens,
      currentAuthority: token.mintAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Freeze Authority',
      role: AuthorityType.FreezeAccount,
      currentAuthority: token.freezeAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Metadata Authority',
      role: 'Metadata',
      currentAuthority: token.metadataAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Pausable Authority',
      role: AuthorityType.Pause,
      currentAuthority: token.pausableAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Confidential Balances Authority',
      role: AuthorityType.ConfidentialTransferMint,
      currentAuthority: token.confidentialBalancesAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Permanent Delegate Authority',
      role: AuthorityType.PermanentDelegate,
      currentAuthority: token.permanentDelegateAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
    {
      label: 'Scaled UI Amount Authority',
      role: AuthorityType.ScaledUiAmount,
      currentAuthority: token.scaledUiAmountAuthority,
      isEditing: false,
      newAuthority: '',
      isLoading: false,
    },
  ];

  const [authorities, setAuthorities] =
    useState<AuthorityInfo[]>(baseAuthorities);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isLoadingAuthorities, setIsLoadingAuthorities] = useState(false);
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { chain: currentChain } = useContext(ChainContext);

  // Create transaction sending signer if wallet is connected
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    selectedWalletAccount!,
    currentChain!
  );

  // Fetch current authorities from blockchain
  useEffect(() => {
    const fetchAuthorities = async () => {
      if (!token.address) return;

      setIsLoadingAuthorities(true);
      try {
        const blockchainAuthorities = await getTokenAuthorities(token.address);

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
          }))
        );
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Failed to fetch authorities'
        );
      } finally {
        setIsLoadingAuthorities(false);
      }
    };

    fetchAuthorities();
  }, [token.address, setError]);

  const startEditing = (index: number) => {
    setAuthorities(prev =>
      prev.map((auth, i) =>
        i === index
          ? {
              ...auth,
              isEditing: true,
              newAuthority: auth.currentAuthority || '',
            }
          : auth
      )
    );
  };

  const cancelEditing = (index: number) => {
    setAuthorities(prev =>
      prev.map((auth, i) =>
        i === index ? { ...auth, isEditing: false, newAuthority: '' } : auth
      )
    );
  };

  const updateAuthority = async (index: number) => {
    if (!token.address || !transactionSendingSigner) return;

    const authority = authorities[index];
    if (!authority.newAuthority.trim()) return;

    setAuthorities(prev =>
      prev.map((auth, i) => (i === index ? { ...auth, isLoading: true } : auth))
    );

    try {
      const result = await updateTokenAuthority(
        {
          mint: token.address,
          role: authority.role,
          newAuthority: authority.newAuthority.trim(),
          rpcUrl: 'https://api.devnet.solana.com',
        },
        transactionSendingSigner
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
              : auth
          )
        );
      } else {
        alert(`Failed to update authority: ${result.error}`);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to update authority'
      );
    } finally {
      setAuthorities(prev =>
        prev.map((auth, i) =>
          i === index ? { ...auth, isLoading: false } : auth
        )
      );
    }
  };

  const validateSolanaAddress = (address: string) => {
    return isAddress(address);
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Token Authorities
            {isLoadingAuthorities && (
              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            )}
          </CardTitle>
          {isDropdownOpen ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </button>
        <CardDescription>
          Manage the authorities for this token. Click edit to change an
          authority.
          <br />
        </CardDescription>
      </CardHeader>
      {isDropdownOpen && (
        <CardContent>
          <div className="space-y-4">
            {authorities.filter(authority => authority.currentAuthority).map((authority, index) => (
              <div key={authority.role} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {authority.label}
                  </label>
                  {!authority.isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(index)}
                      disabled={!selectedWalletAccount}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {authority.isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Enter new authority address"
                        value={authority.newAuthority}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAuthorities(prev =>
                            prev.map((auth, i) =>
                              i === index
                                ? { ...auth, newAuthority: e.target.value }
                                : auth
                            )
                          )
                        }
                        className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <Button
                        size="sm"
                        onClick={() => updateAuthority(index)}
                        disabled={
                          authority.isLoading ||
                          !validateSolanaAddress(authority.newAuthority)
                        }
                      >
                        {authority.isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelEditing(index)}
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
                  <code className="block text-sm bg-muted px-2 py-1 rounded font-mono">
                        {authority.currentAuthority?.slice(0, 8)}...
                        {authority.currentAuthority?.slice(-8)}
                  </code>
                )}
              </div>
            ))}
          </div>

          {!selectedWalletAccount && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Connect your wallet to manage authorities
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
