import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';
import { TokenDisplay } from '@/types/token';
import type { TokenType } from '@mosaic/sdk';

interface TokenStore {
    tokens: TokenDisplay[];
    addToken: (token: TokenDisplay) => void;
    updateToken: (address: string, updates: Partial<TokenDisplay>) => void;
    removeToken: (address: string) => void;
    findTokenByAddress: (address: string) => TokenDisplay | undefined;
    getTokensByWallet: (walletAddress: string) => TokenDisplay[];
    getTokensByType: (type: string) => TokenDisplay[];
    clearAllTokens: () => void;
}

export const useTokenStore = create<TokenStore>()(
    persist(
        (set, get) => ({
            tokens: [],
            addToken: (token) =>
                set((state) => {
                    const existingIndex = state.tokens.findIndex((t) => t.address === token.address);
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
                set((state) => {
                    const index = state.tokens.findIndex((t) => t.address === address);
                    if (index === -1) return state;
                    const updated = [...state.tokens];
                    updated[index] = { ...updated[index], ...updates };
                    return { tokens: updated };
                }),
            removeToken: (address) =>
                set((state) => ({
                    tokens: state.tokens.filter((t) => t.address !== address),
                })),
            findTokenByAddress: (address) => {
                return get().tokens.find((t) => t.address === address);
            },
            getTokensByWallet: (walletAddress) => {
                return get().tokens.filter((t) => t.creatorWallet === walletAddress);
            },
            getTokensByType: (type) => {
                return get().tokens.filter((t) => t.detectedPatterns?.includes(type as TokenType));
            },
            clearAllTokens: () => set({ tokens: [] }),
        }),
        {
            name: 'mosaic_tokens',
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
        useShallow((state) =>
            walletAddress ? state.tokens.filter((t) => t.creatorWallet === walletAddress) : EMPTY_ARRAY,
        ),
    );
}
