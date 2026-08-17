/**
 * Single source of truth for the app's default Solana network.
 *
 * Mosaic is primarily used for experimentation and token-creation demos, so the
 * safe default is Devnet. A deployment can override it with
 * NEXT_PUBLIC_SOLANA_NETWORK.
 */

import type { NetworkName } from '@/stores/rpc-store';

/** Network the app boots into when nothing else is configured. */
export const DEFAULT_NETWORK: NetworkName = 'devnet';

/** Maps a network name to the cluster id used by @solana/connector. */
export const CLUSTER_ID_BY_NETWORK: Record<NetworkName, `solana:${string}`> = {
    'mainnet-beta': 'solana:mainnet',
    devnet: 'solana:devnet',
    testnet: 'solana:testnet',
};

/**
 * Reads and validates NEXT_PUBLIC_SOLANA_NETWORK.
 * Returns undefined when unset or not a recognised network.
 */
export function getEnvNetwork(): NetworkName | undefined {
    // Must be a literal member access - Next.js only inlines NEXT_PUBLIC_* that way.
    const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    if (!envNetwork) return undefined;

    const sanitized = envNetwork.trim().toLowerCase();
    if (sanitized === 'mainnet' || sanitized === 'mainnet-beta') return 'mainnet-beta';
    if (sanitized === 'devnet') return 'devnet';
    if (sanitized === 'testnet') return 'testnet';

    return undefined;
}

/** The configured default network: the env override, else Devnet. */
export function getConfiguredNetwork(): NetworkName {
    return getEnvNetwork() ?? DEFAULT_NETWORK;
}

/** The cluster id the app defaults to when the user has made no explicit choice. */
export function getDefaultClusterId(): `solana:${string}` {
    return CLUSTER_ID_BY_NETWORK[getConfiguredNetwork()];
}
