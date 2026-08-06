'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useConnector } from '@solana/connector/react';
import { useKitTransactionSigner } from '@solana/connector';
import type { Address } from '@solana/kit';
import type { ConfidentialKeys } from '@solana/mosaic-sdk/confidential';
import { createConnectorMessageSigner, type ConnectorSignMessage } from '../lib/message-signer-adapter';

/**
 * In-memory cache of the ElGamal + AES keys for confidential accounts, keyed by
 * `(owner, mint)`.
 *
 * The keys are derived deterministically from a wallet signature
 * (`deriveConfidentialKeysForOwnerMint`), so they never need persisting — but
 * deriving prompts the wallet, so we derive once per `(owner, mint)` and reuse
 * the result for the session. The keys own WASM memory, so they are freed when
 * the wallet disconnects/switches or the provider unmounts.
 */
interface ConfidentialKeysContextValue {
    /** Whether a wallet capable of message signing is connected. */
    canDerive: boolean;
    /** Derives (or returns the cached) keys for `mint` under the connected wallet. */
    getKeys: (mint: Address) => Promise<ConfidentialKeys>;
}

const ConfidentialKeysContext = createContext<ConfidentialKeysContextValue | null>(null);

export function ConfidentialKeysProvider({ children }: { children: React.ReactNode }) {
    const { selectedAccount } = useConnector();
    const { signer } = useKitTransactionSigner();

    const owner = selectedAccount ? (String(selectedAccount) as Address) : undefined;
    // `@solana/connector`'s signer exposes an optional single-message signer.
    const signMessage = (signer as { signMessage?: ConnectorSignMessage } | null)?.signMessage;

    // Cache + in-flight derivations, keyed by `${owner}:${mint}`.
    const cacheRef = useRef<Map<string, ConfidentialKeys>>(new Map());
    const inflightRef = useRef<Map<string, Promise<ConfidentialKeys>>>(new Map());

    const freeAll = useCallback(async () => {
        if (cacheRef.current.size === 0) return;
        const { freeConfidentialKeys } = await import('@solana/mosaic-sdk/confidential');
        for (const keys of cacheRef.current.values()) {
            try {
                freeConfidentialKeys(keys);
            } catch {
                // Already freed or freeing failed — nothing actionable.
            }
        }
        cacheRef.current.clear();
        inflightRef.current.clear();
    }, []);

    // Free cached WASM keys whenever the wallet changes, and on unmount.
    useEffect(() => {
        return () => {
            void freeAll();
        };
    }, [owner, freeAll]);

    const getKeys = useCallback(
        async (mint: Address): Promise<ConfidentialKeys> => {
            if (!owner) throw new Error('Connect a wallet to derive confidential keys.');
            if (!signMessage) {
                throw new Error(
                    'The connected wallet does not support message signing, which is required to derive confidential keys.',
                );
            }

            const key = `${owner}:${mint}`;
            const cached = cacheRef.current.get(key);
            if (cached) return cached;

            const existing = inflightRef.current.get(key);
            if (existing) return existing;

            const derivation = (async () => {
                const { deriveConfidentialKeysForOwnerMint } = await import('@solana/mosaic-sdk/confidential');
                const messageSigner = createConnectorMessageSigner(owner, signMessage);
                const keys = await deriveConfidentialKeysForOwnerMint({ signer: messageSigner, owner, mint });
                cacheRef.current.set(key, keys);
                inflightRef.current.delete(key);
                return keys;
            })().catch(err => {
                inflightRef.current.delete(key);
                throw err;
            });

            inflightRef.current.set(key, derivation);
            return derivation;
        },
        [owner, signMessage],
    );

    const value = useMemo<ConfidentialKeysContextValue>(
        () => ({ canDerive: !!owner && !!signMessage, getKeys }),
        [owner, signMessage, getKeys],
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
