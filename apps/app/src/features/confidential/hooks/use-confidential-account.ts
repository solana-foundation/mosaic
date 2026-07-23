'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { ConfidentialAccountState } from '@solana/mosaic-sdk/confidential';
import { humanizeError } from '@/lib/errors';
import { useConfidentialKeys } from './use-confidential-keys';

export interface UseConfidentialAccountResult {
    /** Decoded confidential-account state, or null when the account is not configured. */
    state: ConfidentialAccountState | null;
    /** Whether the account carries the `ConfidentialTransferAccount` extension. */
    isConfigured: boolean;
    /** Whether balances have been decrypted (requires a wallet signature once). */
    isRevealed: boolean;
    isLoading: boolean;
    error: string | null;
    /** Re-fetch state; decrypts too if already revealed (uses cached keys, no prompt). */
    refresh: () => void;
    /** Derive keys (prompts once) and decrypt the pending + available balances. */
    reveal: () => void;
    /** Whether the connected wallet can derive keys to reveal balances. */
    canReveal: boolean;
}

/**
 * Reads a token account's confidential-transfer state for the balance panel.
 *
 * The initial load and plain `refresh` decode the account **without** keys — so
 * they never prompt the wallet — surfacing configuration, approval, and the
 * credit counters. Decrypted pending/available balances require keys, so they
 * are fetched only after {@link UseConfidentialAccountResult.reveal} (one wallet
 * signature; cached thereafter).
 */
export function useConfidentialAccount(input: {
    mint: Address;
    tokenAccount: Address | undefined;
    rpc: Rpc<SolanaRpcApi> | null;
}): UseConfidentialAccountResult {
    const { mint, tokenAccount, rpc } = input;
    const { getKeys, canDerive } = useConfidentialKeys();

    const [state, setState] = useState<ConfidentialAccountState | null>(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (withReveal: boolean) => {
            if (!rpc || !tokenAccount) return;
            setIsLoading(true);
            setError(null);
            try {
                const { fetchConfidentialAccountState } = await import('@solana/mosaic-sdk/confidential');
                const keys = withReveal ? await getKeys(mint) : undefined;
                const next = await fetchConfidentialAccountState(
                    rpc,
                    tokenAccount,
                    keys ? { keys, decryptPendingBalance: true } : {},
                );
                setState(next);
                setIsConfigured(next !== null);
                if (withReveal) setIsRevealed(true);
            } catch (err) {
                setError(humanizeError(err));
            } finally {
                setIsLoading(false);
            }
        },
        [rpc, tokenAccount, mint, getKeys],
    );

    const refresh = useCallback(() => void load(isRevealed), [load, isRevealed]);
    const reveal = useCallback(() => void load(true), [load]);

    // Initial, prompt-free load whenever the account or RPC changes.
    useEffect(() => {
        setIsRevealed(false);
        void load(false);
    }, [tokenAccount, rpc, load]);

    return {
        state,
        isConfigured,
        isRevealed,
        isLoading,
        error,
        refresh,
        reveal,
        canReveal: canDerive,
    };
}
