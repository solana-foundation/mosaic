'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useConnector } from '@solana/connector/react';
import { getWallets } from '@wallet-standard/core';
import type { Address } from '@solana/kit';
import {
    isTransactionV1Forced,
    rpcSupportsTransactionV1,
    type ConfidentialTxVersion,
} from '../lib/transaction-version';

/**
 * Whether the Wallet Standard registry holds a wallet that can sign a version-1
 * transaction for `owner`.
 *
 * Deliberately reads the registry directly rather than asking the connector:
 * `solana:signTransaction` advertises the transaction versions it accepts, and
 * that list is the only honest answer to the question. Same subscription shape
 * as `useWalletStandardCanSignMessage` in `use-confidential-keys.tsx` — the
 * registry is browser-only, so server rendering always reports false.
 */
function useWalletStandardSupportsTransactionV1(owner: Address | undefined): boolean {
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
            .some(wallet => {
                if (!wallet.accounts.some(account => account.address === owner)) return false;
                const feature = wallet.features['solana:signTransaction'] as
                    | { supportedTransactionVersions?: readonly unknown[] }
                    | undefined;
                // `@solana/wallet-standard-features` still types this array as
                // ('legacy' | 0)[], so the `1` it would have to contain is
                // outside the published union — hence the unknown[] read. Until
                // a wallet ships version-1 signing this correctly reports false.
                return feature?.supportedTransactionVersions?.includes(1) ?? false;
            });
    }, [owner]);

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export interface ConfidentialTxVersionState {
    /** The version to plan confidential operations into. */
    version: ConfidentialTxVersion;
    /** True while the RPC probe is still in flight. */
    isProbing: boolean;
    /** Whether the connected wallet advertises version-1 signing. */
    walletSupportsV1: boolean;
    /** Whether the selected RPC accepts version-1 transactions. */
    rpcSupportsV1: boolean;
    /** Whether `NEXT_PUBLIC_CONFIDENTIAL_TX_VERSION=1` is overriding the probes. */
    isForced: boolean;
}

/**
 * Resolves the transaction version the confidential flows should plan into,
 * probing the selected RPC and the connected wallet. Falls back to version 0 —
 * the SDK default, universally accepted — whenever either end is unproven.
 */
export function useConfidentialTxVersion(): ConfidentialTxVersionState {
    const { selectedAccount, cluster } = useConnector();
    const owner = selectedAccount ? (String(selectedAccount) as Address) : undefined;

    const walletSupportsV1 = useWalletStandardSupportsTransactionV1(owner);
    const [rpcSupportsV1, setRpcSupportsV1] = useState(false);
    // Starts true so the first render — before the effect has run — reports
    // "probing" rather than "this RPC does not support version 1", which would
    // flash the notice below for a frame on every mount.
    const [isProbing, setIsProbing] = useState(true);

    const url = cluster?.url;
    useEffect(() => {
        if (!url) {
            setRpcSupportsV1(false);
            setIsProbing(false);
            return;
        }
        let active = true;
        setIsProbing(true);
        rpcSupportsTransactionV1(url)
            .then(supported => {
                if (active) setRpcSupportsV1(supported);
            })
            .finally(() => {
                if (active) setIsProbing(false);
            });
        return () => {
            active = false;
        };
    }, [url]);

    const isForced = isTransactionV1Forced();
    // The override skips the wallet probe but not the RPC probe: a wallet can be
    // patched or swapped for testing, whereas a node that has not activated the
    // txv1 gate will simply reject the transaction whatever the app believes.
    const version: ConfidentialTxVersion = (isForced || walletSupportsV1) && rpcSupportsV1 ? 1 : 0;

    return { version, isProbing, walletSupportsV1, rpcSupportsV1, isForced };
}
