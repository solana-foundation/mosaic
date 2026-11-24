'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useConnector } from '@solana/connector/react';
import { useTransactionSigner } from '@solana/connector';
import { getWallets } from '@wallet-standard/core';
import type { Address } from '@solana/kit';
import type { ConfidentialKeys, SignMessage } from '@solana/mosaic-sdk/confidential';

/**
 * In-memory cache of the ElGamal + AES keys for confidential accounts, keyed by
 * the wallet **owner alone**.
 *
 * Derivation is wallet-only (`deriveConfidentialKeys` signs the canonical
 * `solana-conf-bal/v1` message over an empty seed), so one wallet has exactly
 * one keypair covering every mint and token account it holds — caching per mint
 * would cost one wallet prompt per mint for identical keys.
 *
 * The keys are reproducible from a wallet signature, so they never need
 * persisting — but deriving prompts the wallet, so we derive once per owner and
 * reuse the result for the session. They own WASM memory, so they are freed when
 * the wallet disconnects/switches or the provider unmounts.
 *
 * Freeing is deferred around work that is still using them. Keys are only
 * handed out through {@link ConfidentialKeysContextValue.withKeys}, which holds
 * a lease for the duration of the callback (proof generation, decryption); a
 * wallet switch retires the keys, and retired keys are freed when their last
 * lease ends. A derivation still waiting on its wallet signature when the
 * wallet switches frees its result instead of caching it.
 */
interface ConfidentialKeysContextValue {
    /** Whether a wallet capable of message signing is connected. */
    canDerive: boolean;
    /**
     * Runs `run` with the connected wallet's confidential keys, deriving them
     * first (one wallet prompt) if they are not cached. The keys stay valid
     * until `run` settles; do not keep them beyond it.
     */
    withKeys: <T>(run: (keys: ConfidentialKeys) => Promise<T>) => Promise<T>;
}

/** Cached keys plus the bookkeeping that decides when they may be freed. */
interface KeyEntry {
    keys: ConfidentialKeys;
    /** Callbacks currently running with these keys. */
    leases: number;
    /** Set when the wallet switched or the provider unmounted; free at zero leases. */
    retired: boolean;
}

const WALLET_CHANGED = 'The wallet changed while confidential keys were in use. Try again.';

async function freeKeys(keys: ConfidentialKeys): Promise<void> {
    const { freeConfidentialKeys } = await import('@solana/mosaic-sdk/confidential');
    try {
        freeConfidentialKeys(keys);
    } catch {
        // Already freed or freeing failed — nothing actionable.
    }
}

const ConfidentialKeysContext = createContext<ConfidentialKeysContextValue | null>(null);

/**
 * Whether the browser's Wallet Standard registry holds a wallet that can sign
 * messages for `owner`. This is the path `createResilientSignMessage` tries
 * first, and checking it costs no WASM — so the page can warn about an
 * incompatible wallet before anything has been spent on-chain.
 */
function useWalletStandardCanSignMessage(owner: Address | undefined): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const wallets = getWallets();
        const offRegister = wallets.on('register', onChange);
        const offUnregister = wallets.on('unregister', onChange);
        return () => {
            offRegister();
            offUnregister();
        };
    }, []);

    const getSnapshot = useCallback(() => {
        if (!owner) return false;
        return getWallets()
            .get()
            .some(
                wallet =>
                    typeof (wallet.features['solana:signMessage'] as { signMessage?: unknown } | undefined)
                        ?.signMessage === 'function' && wallet.accounts.some(account => account.address === owner),
            );
    }, [owner]);

    // The registry is browser-only; server rendering always reports false.
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function ConfidentialKeysProvider({ children }: { children: React.ReactNode }) {
    const { selectedAccount } = useConnector();
    // Deliberately the *connector* signer, not the kit-adapted one: the kit
    // adapter (`createKitTransactionSigner`) returns a fresh object exposing only
    // `address` and `modifyAndSignTransactions`, dropping `signMessage`. The
    // connector signer carries the optional single-message primitive, gated by
    // `capabilities.canSignMessage`. It is only ever the *fallback* — see
    // `createResilientSignMessage`, which prefers the Wallet Standard registry
    // because the connector's own message path is broken for both the wallets it
    // demotes (Phantom) and the ones it accepts.
    const { signer, capabilities } = useTransactionSigner();

    const owner = selectedAccount ? (String(selectedAccount) as Address) : undefined;

    const connectorSignMessage = useMemo<SignMessage | undefined>(() => {
        if (!capabilities.canSignMessage) return undefined;
        return (signer as { signMessage?: SignMessage } | null)?.signMessage;
    }, [capabilities.canSignMessage, signer]);

    const walletStandardCanSign = useWalletStandardCanSignMessage(owner);

    // Cache + in-flight derivations, keyed by owner.
    const cacheRef = useRef<Map<string, KeyEntry>>(new Map());
    const inflightRef = useRef<Map<string, Promise<KeyEntry>>>(new Map());
    // Bumped on every retirement, so a derivation can tell that the wallet it
    // started for is gone by the time its signature arrives.
    const epochRef = useRef(0);

    const retireAll = useCallback(() => {
        epochRef.current++;
        for (const entry of cacheRef.current.values()) {
            entry.retired = true;
            if (entry.leases === 0) void freeKeys(entry.keys);
        }
        cacheRef.current.clear();
        inflightRef.current.clear();
    }, []);

    // Retire cached WASM keys whenever the wallet changes, and on unmount.
    useEffect(() => {
        return () => retireAll();
    }, [owner, retireAll]);

    const acquire = useCallback(async (): Promise<KeyEntry> => {
        if (!owner) throw new Error('Connect a wallet to derive confidential keys.');

        const cached = cacheRef.current.get(owner);
        if (cached) return cached;

        const existing = inflightRef.current.get(owner);
        if (existing) return existing;

        const epoch = epochRef.current;
        const derivation: Promise<KeyEntry> = (async () => {
            // Both imports are deferred so the `@solana/zk-sdk` WASM stays off
            // the initial route bundle — the wallet-standard subpath pulls it at
            // module scope to precompute the canonical derivation message.
            const [{ deriveConfidentialKeys }, { createResilientSignMessage, createMessageSigner }] = await Promise.all(
                [import('@solana/mosaic-sdk/confidential'), import('@solana/mosaic-sdk/confidential/wallet-standard')],
            );

            const signMessage = createResilientSignMessage(owner, connectorSignMessage);
            if (!signMessage) {
                throw new Error(
                    'The connected wallet does not support message signing, which is required to derive confidential keys.',
                );
            }

            const keys = await deriveConfidentialKeys({ signer: createMessageSigner(owner, signMessage) });
            if (epoch !== epochRef.current) {
                // Retirement already ran while the signature was pending, so
                // nothing would ever free these if they were cached.
                await freeKeys(keys);
                throw new Error(WALLET_CHANGED);
            }
            const entry: KeyEntry = { keys, leases: 0, retired: false };
            cacheRef.current.set(owner, entry);
            return entry;
        })().finally(() => {
            // Only our own slot: after a switch away and back, the map may
            // already hold a newer derivation for the same owner.
            if (inflightRef.current.get(owner) === derivation) inflightRef.current.delete(owner);
        });

        inflightRef.current.set(owner, derivation);
        return derivation;
    }, [owner, connectorSignMessage]);

    const withKeys = useCallback(
        async <T,>(run: (keys: ConfidentialKeys) => Promise<T>): Promise<T> => {
            const entry = await acquire();
            // Checked and leased in the same tick, so retirement cannot slip in between.
            if (entry.retired) throw new Error(WALLET_CHANGED);
            entry.leases++;
            try {
                return await run(entry.keys);
            } finally {
                entry.leases--;
                if (entry.retired && entry.leases === 0) void freeKeys(entry.keys);
            }
        },
        [acquire],
    );

    const value = useMemo<ConfidentialKeysContextValue>(
        () => ({ canDerive: !!owner && (walletStandardCanSign || !!connectorSignMessage), withKeys }),
        [owner, walletStandardCanSign, connectorSignMessage, withKeys],
    );

    return <ConfidentialKeysContext.Provider value={value}>{children}</ConfidentialKeysContext.Provider>;
}

export function useConfidentialKeys(): ConfidentialKeysContextValue {
    const ctx = useContext(ConfidentialKeysContext);
    if (!ctx) {
        throw new Error('useConfidentialKeys must be used within a ConfidentialKeysProvider.');
    }
    return ctx;
}
