import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { type Address, createSolanaRpc, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

// Original SPL Token program address
const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;

// Token balance result
interface TokenBalanceResult {
    /** Raw balance in smallest unit (bigint) */
    rawBalance: bigint;
    /** Formatted balance as string with decimals */
    formattedBalance: string;
    /** Number of decimals for the token */
    decimals: number;
    /** UI amount as number */
    uiAmount: number;
}

// Token account state for a specific wallet+mint combination
interface TokenAccountState {
    hasTokenAccount: boolean;
    balance: TokenBalanceResult | null;
    isLoading: boolean;
    error: string | null;
    lastFetched: number | null;
}

// Default state factory
function createDefaultTokenAccountState(): TokenAccountState {
    return {
        hasTokenAccount: false,
        balance: null,
        isLoading: false,
        error: null,
        lastFetched: null,
    };
}

// Store interface
interface TokenAccountStore {
    // State: keyed by `${walletAddress}-${mintAddress}`
    accounts: Record<string, TokenAccountState>;

    // Actions
    fetchTokenAccount: (walletAddress: string, mintAddress: string, rpcUrl: string) => Promise<void>;
    refetchTokenAccount: (walletAddress: string, mintAddress: string, rpcUrl: string) => Promise<void>;

    // Utility actions
    clearAccount: (walletAddress: string, mintAddress: string) => void;
    getAccountState: (walletAddress: string, mintAddress: string) => TokenAccountState;
}

// Generate key for wallet+mint combination
function getAccountKey(walletAddress: string, mintAddress: string): string {
    return `${walletAddress}-${mintAddress}`;
}

// Helper to ensure account state exists (mutates in place with Immer)
function ensureAccount(state: TokenAccountStore, key: string): TokenAccountState {
    if (!state.accounts[key]) {
        state.accounts[key] = createDefaultTokenAccountState();
    }
    return state.accounts[key];
}

/**
 * Try to get token balance from a specific ATA
 */
async function tryGetBalance(
    rpc: Rpc<SolanaRpcApi>,
    mintAddress: Address,
    walletAddress: Address,
    tokenProgram: typeof TOKEN_2022_PROGRAM_ADDRESS | typeof TOKEN_PROGRAM_ADDRESS,
): Promise<TokenBalanceResult | null> {
    try {
        const [ata] = await findAssociatedTokenPda({
            mint: mintAddress,
            owner: walletAddress,
            tokenProgram,
        });

        const accountInfo = await rpc.getAccountInfo(ata, { encoding: 'jsonParsed' }).send();

        if (!accountInfo?.value?.data) {
            return null;
        }

        const balanceResult = await rpc.getTokenAccountBalance(ata).send();

        return {
            rawBalance: BigInt(balanceResult.value.amount),
            formattedBalance: balanceResult.value.uiAmountString ?? '0',
            decimals: balanceResult.value.decimals,
            uiAmount: balanceResult.value.uiAmount ?? 0,
        };
    } catch {
        return null;
    }
}

export const useTokenAccountStore = create<TokenAccountStore>()(
    immer((set, get) => ({
        accounts: {},

        // Fetch token account state from chain
        fetchTokenAccount: async (walletAddress: string, mintAddress: string, rpcUrl: string) => {
            const key = getAccountKey(walletAddress, mintAddress);

            // Set loading state
            set(state => {
                const account = ensureAccount(state, key);
                account.isLoading = true;
                account.error = null;
            });

            try {
                const rpc = createSolanaRpc(rpcUrl) as Rpc<SolanaRpcApi>;

                // Try Token-2022 first (most common for this app)
                let result = await tryGetBalance(
                    rpc,
                    mintAddress as Address,
                    walletAddress as Address,
                    TOKEN_2022_PROGRAM_ADDRESS,
                );

                // If not found, try regular SPL Token program
                if (!result) {
                    result = await tryGetBalance(
                        rpc,
                        mintAddress as Address,
                        walletAddress as Address,
                        TOKEN_PROGRAM_ADDRESS,
                    );
                }

                set(state => {
                    const account = ensureAccount(state, key);
                    account.isLoading = false;
                    account.lastFetched = Date.now();

                    if (result) {
                        account.hasTokenAccount = true;
                        account.balance = result;
                    } else {
                        // No token account exists
                        account.hasTokenAccount = false;
                        account.balance = {
                            rawBalance: 0n,
                            formattedBalance: '0',
                            decimals: 9,
                            uiAmount: 0,
                        };
                    }
                    account.error = null;
                });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to fetch token account', err);
                set(state => {
                    const account = ensureAccount(state, key);
                    account.isLoading = false;
                    account.lastFetched = Date.now();
                    account.hasTokenAccount = false;
                    account.balance = {
                        rawBalance: 0n,
                        formattedBalance: '0',
                        decimals: 9,
                        uiAmount: 0,
                    };
                    account.error = null; // Don't show error for missing accounts
                });
            }
        },

        // Force refetch (bypass any caching)
        refetchTokenAccount: async (walletAddress: string, mintAddress: string, rpcUrl: string) => {
            await get().fetchTokenAccount(walletAddress, mintAddress, rpcUrl);
        },

        // Clear account state
        clearAccount: (walletAddress: string, mintAddress: string) => {
            const key = getAccountKey(walletAddress, mintAddress);
            set(state => {
                delete state.accounts[key];
            });
        },

        // Get account state with defaults
        getAccountState: (walletAddress: string, mintAddress: string) => {
            const key = getAccountKey(walletAddress, mintAddress);
            return get().accounts[key] ?? createDefaultTokenAccountState();
        },
    })),
);

// Default state for selector
const DEFAULT_TOKEN_ACCOUNT_STATE: TokenAccountState = {
    hasTokenAccount: false,
    balance: null,
    isLoading: false,
    error: null,
    lastFetched: null,
};

/**
 * Selector hook for token account state of a specific wallet+mint combination
 * Uses useShallow to prevent unnecessary re-renders
 */
export function useTokenAccountState(
    walletAddress: string | undefined,
    mintAddress: string | undefined,
): TokenAccountState {
    return useTokenAccountStore(
        useShallow(state => {
            if (!walletAddress || !mintAddress) return DEFAULT_TOKEN_ACCOUNT_STATE;
            const key = getAccountKey(walletAddress, mintAddress);
            return state.accounts[key] ?? DEFAULT_TOKEN_ACCOUNT_STATE;
        }),
    );
}
