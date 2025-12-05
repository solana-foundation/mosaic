import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';
import { TokenDisplay } from '@/types/token';
import { getTokenDashboardData, type TokenType } from '@mosaic/sdk';
import { address as toAddress, type Address, type Rpc, type SolanaRpcApi } from 'gill';

interface MetadataFetchState {
    isLoading: boolean;
    error: string | null;
    lastFetched: number | null;
}

interface TokenStore {
    tokens: TokenDisplay[];
    // Metadata fetch state keyed by mint address
    metadataFetchState: Record<string, MetadataFetchState>;
    addToken: (token: TokenDisplay) => void;
    updateToken: (address: string, updates: Partial<TokenDisplay>) => void;
    removeToken: (address: string) => void;
    findTokenByAddress: (address: string) => TokenDisplay | undefined;
    getTokensByWallet: (walletAddress: string) => TokenDisplay[];
    getTokensByType: (type: string) => TokenDisplay[];
    clearAllTokens: () => void;
    // New: fetch metadata from blockchain
    fetchTokenMetadata: (
        mintAddress: string,
        rpc: Rpc<SolanaRpcApi>,
        creatorWallet?: string,
    ) => Promise<TokenDisplay | null>;
    getMetadataFetchState: (mintAddress: string) => MetadataFetchState;
}

// Default metadata fetch state
const DEFAULT_METADATA_FETCH_STATE: MetadataFetchState = {
    isLoading: false,
    error: null,
    lastFetched: null,
};

/**
 * Fetch image URL from off-chain metadata JSON
 * Supports standard metadata format (Metaplex-compatible)
 */
async function fetchImageFromUri(uri: string): Promise<string | undefined> {
    try {
        const response = await fetch(uri);
        if (!response.ok) return undefined;

        const metadata = await response.json();
        // Standard metadata format has 'image' field
        return metadata.image || undefined;
    } catch {
        // Silently fail - off-chain metadata fetch is best-effort
        return undefined;
    }
}

export const useTokenStore = create<TokenStore>()(
    persist(
        (set, get) => ({
            tokens: [],
            metadataFetchState: {},
            addToken: token =>
                set(state => {
                    const existingIndex = state.tokens.findIndex(t => t.address === token.address);
                    if (existingIndex >= 0) {
                        // Update existing token
                        const updated = [...state.tokens];
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            ...token,
                            createdAt: updated[existingIndex].createdAt || new Date().toISOString(),
                        };
                        return { tokens: updated };
                    }
                    // Add new token
                    return {
                        tokens: [
                            ...state.tokens,
                            {
                                ...token,
                                createdAt: token.createdAt || new Date().toISOString(),
                            },
                        ],
                    };
                }),
            updateToken: (address, updates) =>
                set(state => {
                    const index = state.tokens.findIndex(t => t.address === address);
                    if (index === -1) return state;
                    const updated = [...state.tokens];
                    updated[index] = { ...updated[index], ...updates };
                    return { tokens: updated };
                }),
            removeToken: address =>
                set(state => ({
                    tokens: state.tokens.filter(t => t.address !== address),
                })),
            findTokenByAddress: address => {
                return get().tokens.find(t => t.address === address);
            },
            getTokensByWallet: walletAddress => {
                return get().tokens.filter(t => t.creatorWallet === walletAddress);
            },
            getTokensByType: type => {
                return get().tokens.filter(t => t.detectedPatterns?.includes(type as TokenType));
            },
            clearAllTokens: () => set({ tokens: [] }),

            // Fetch token metadata from blockchain and update the store
            fetchTokenMetadata: async (mintAddress, rpc, creatorWallet) => {
                // Set loading state
                set(state => ({
                    metadataFetchState: {
                        ...state.metadataFetchState,
                        [mintAddress]: {
                            isLoading: true,
                            error: null,
                            lastFetched: null,
                        },
                    },
                }));

                try {
                    // Convert string to Address type
                    const mint = toAddress(mintAddress) as Address;

                    // Fetch token data from blockchain
                    const tokenData = await getTokenDashboardData(rpc, mint);

                    // Get image: prefer on-chain additionalMetadata, fallback to off-chain JSON
                    let image = tokenData.image;
                    if (!image && tokenData.uri) {
                        image = await fetchImageFromUri(tokenData.uri);
                    }

                    // Convert to TokenDisplay format
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
                        image,
                        createdAt: new Date().toISOString(),
                        creatorWallet,
                    };

                    // Add or update token in store
                    get().addToken(tokenDisplay);

                    // Update fetch state
                    set(state => ({
                        metadataFetchState: {
                            ...state.metadataFetchState,
                            [mintAddress]: {
                                isLoading: false,
                                error: null,
                                lastFetched: Date.now(),
                            },
                        },
                    }));

                    return tokenDisplay;
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch token metadata';

                    // Update fetch state with error
                    set(state => ({
                        metadataFetchState: {
                            ...state.metadataFetchState,
                            [mintAddress]: {
                                isLoading: false,
                                error: errorMessage,
                                lastFetched: null,
                            },
                        },
                    }));

                    return null;
                }
            },

            getMetadataFetchState: mintAddress => {
                return get().metadataFetchState[mintAddress] ?? DEFAULT_METADATA_FETCH_STATE;
            },
        }),
        {
            name: 'mosaic_tokens',
            // Only persist tokens, not the fetch state
            partialize: state => ({ tokens: state.tokens }),
        },
    ),
);

// Stable empty array reference to prevent re-renders
const EMPTY_ARRAY: TokenDisplay[] = [];

/**
 * Selector hook for wallet-filtered tokens
 * Automatically re-renders when tokens change
 * Uses useShallow to prevent infinite loops by doing shallow comparison
 */
export function useWalletTokens(walletAddress: string | undefined): TokenDisplay[] {
    return useTokenStore(
        useShallow(state =>
            walletAddress ? state.tokens.filter(t => t.creatorWallet === walletAddress) : EMPTY_ARRAY,
        ),
    );
}

/**
 * Selector hook for metadata fetch state of a specific token
 * Uses useShallow to prevent unnecessary re-renders
 */
export function useMetadataFetchState(mintAddress: string | undefined): MetadataFetchState {
    return useTokenStore(
        useShallow(state =>
            mintAddress
                ? (state.metadataFetchState[mintAddress] ?? DEFAULT_METADATA_FETCH_STATE)
                : DEFAULT_METADATA_FETCH_STATE,
        ),
    );
}
