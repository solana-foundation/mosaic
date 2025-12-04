'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConnector } from '@solana/connector/react';
import { type Address, createSolanaRpc, type Rpc, type SolanaRpcApi } from 'gill';
import { getAssociatedTokenAccountAddress, TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from 'gill/programs';

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

interface UseTokenBalanceReturn {
    balance: TokenBalanceResult | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
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
        const ata = await getAssociatedTokenAccountAddress(mintAddress, walletAddress, tokenProgram);

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

/**
 * Hook to fetch the token balance for the connected wallet
 * Tries both Token-2022 and regular SPL Token programs
 */
export function useTokenBalance(mintAddress: string | undefined): UseTokenBalanceReturn {
    const { selectedAccount, cluster } = useConnector();
    const [balance, setBalance] = useState<TokenBalanceResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url) as Rpc<SolanaRpcApi>;
    }, [cluster?.url]);

    const refetch = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    useEffect(() => {
        let canceled = false;

        async function fetchBalance() {
            if (!selectedAccount || !rpc || !mintAddress) {
                setBalance(null);
                setError(null);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                // Try Token-2022 first (most common for this app)
                let result = await tryGetBalance(
                    rpc,
                    mintAddress as Address,
                    selectedAccount as Address,
                    TOKEN_2022_PROGRAM_ADDRESS,
                );

                // If not found, try regular SPL Token program
                if (!result) {
                    result = await tryGetBalance(
                        rpc,
                        mintAddress as Address,
                        selectedAccount as Address,
                        TOKEN_PROGRAM_ADDRESS,
                    );
                }

                if (!canceled) {
                    if (result) {
                        setBalance(result);
                    } else {
                        // No token account exists - balance is 0
                        setBalance({
                            rawBalance: 0n,
                            formattedBalance: '0',
                            decimals: 9, // Default decimals
                            uiAmount: 0,
                        });
                    }
                    setError(null);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to fetch token balance', err);
                if (!canceled) {
                    // Likely no token account - treat as 0 balance
                    setBalance({
                        rawBalance: 0n,
                        formattedBalance: '0',
                        decimals: 9,
                        uiAmount: 0,
                    });
                    setError(null);
                }
            } finally {
                if (!canceled) {
                    setIsLoading(false);
                }
            }
        }

        fetchBalance();

        return () => {
            canceled = true;
        };
    }, [selectedAccount, rpc, mintAddress, refreshTrigger]);

    return { balance, isLoading, error, refetch };
}
