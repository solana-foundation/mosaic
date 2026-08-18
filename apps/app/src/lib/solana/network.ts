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

export interface ClusterDefinition {
    id: `solana:${string}`;
    label: string;
    name: NetworkName;
    url: string;
}

/**
 * The built-in clusters, shared by the connector setup and the network picker so
 * the two cannot drift apart.
 *
 * Devnet is listed first so that a stale persisted cluster id (e.g. a custom RPC
 * the user later deleted) falls back to Devnet rather than Mainnet:
 * ClusterManager resolves an unknown stored id to clusters[0].
 */
export const BUILTIN_CLUSTERS: ClusterDefinition[] = [
    {
        id: 'solana:devnet',
        label: 'Devnet',
        name: 'devnet',
        url: 'https://api.devnet.solana.com',
    },
    {
        id: 'solana:mainnet',
        label: 'Mainnet',
        name: 'mainnet-beta',
        url: 'https://api.mainnet-beta.solana.com',
    },
    {
        id: 'solana:testnet',
        label: 'Testnet',
        name: 'testnet',
        url: 'https://api.testnet.solana.com',
    },
];

/** Maps a network name to the cluster id used by @solana/connector. */
export const CLUSTER_ID_BY_NETWORK = Object.fromEntries(
    BUILTIN_CLUSTERS.map(cluster => [cluster.name, cluster.id]),
) as Record<NetworkName, `solana:${string}`>;

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
