'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { ConfidentialAccountState, ConfidentialKeys } from '@solana/mosaic-sdk/confidential';
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
    tokenAccount: Address | undefined;
    rpc: Rpc<SolanaRpcApi> | null;
}): UseConfidentialAccountResult {
    const { tokenAccount, rpc } = input;
    const { withKeys, canDerive } = useConfidentialKeys();

    const [state, setState] = useState<ConfidentialAccountState | null>(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Id of the latest load. Only that load may write state: an earlier one (a
    // slow reveal still waiting on its wallet prompt, say) can resolve after the
    // account or RPC changed, and would show the old account's balances.
    const latestLoadRef = useRef(0);

    // The account and RPC currently selected. A `refresh` closure from an
    // earlier render (held by an operation that finishes after the selection
    // changed) still loads the old pair, and bumping the id above would let it
    // supersede the current load and show the old account's balances. Such a
    // load is dropped before it starts.
    const selectionRef = useRef({ rpc, tokenAccount });

    const load = useCallback(
        async (withReveal: boolean) => {
            if (!rpc || !tokenAccount) return;
            const selected = selectionRef.current;
            if (selected.rpc !== rpc || selected.tokenAccount !== tokenAccount) return;
            const id = ++latestLoadRef.current;
            const isLatest = () => id === latestLoadRef.current;
            setIsLoading(true);
            setError(null);
            try {
                const { fetchConfidentialAccountState } = await import('@solana/mosaic-sdk/confidential');
                const fetchState = (keys?: ConfidentialKeys) =>
                    fetchConfidentialAccountState(rpc, tokenAccount, keys ? { keys, decryptPendingBalance: true } : {});
                // Decryption runs inside the key lease, so a wallet switch
                // cannot free the keys mid-decrypt.
                const next = withReveal ? await withKeys(fetchState) : await fetchState();
                if (!isLatest()) return;
                setState(next);
                setIsConfigured(next !== null);
                if (withReveal) setIsRevealed(true);
            } catch (err) {
                if (isLatest()) setError(humanizeError(err));
            } finally {
                if (isLatest()) setIsLoading(false);
            }
        },
        [rpc, tokenAccount, withKeys],
    );

    const refresh = useCallback(() => void load(isRevealed), [load, isRevealed]);
    const reveal = useCallback(() => void load(true), [load]);

    // Initial, prompt-free load whenever the account or RPC changes. The previous
    // selection's state is cleared first, and any load still in flight for it is
    // superseded, so nothing of the old account stays on screen.
    useEffect(() => {
        selectionRef.current = { rpc, tokenAccount };
        latestLoadRef.current++;
        setState(null);
        setIsConfigured(false);
        setIsRevealed(false);
        setIsLoading(false);
        setError(null);
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
