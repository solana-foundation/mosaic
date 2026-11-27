'use client';

import { useKitTransactionSigner } from '@solana/connector';
import { useConnector } from '@solana/connector/react';
import type { TransactionModifyingSigner } from '@solana/kit';
import { BUILTIN_CLUSTERS, CLUSTER_ID_BY_NETWORK } from '@/lib/solana/network';
import { useRpcStore } from '@/stores/rpc-store';

/**
 * The Wallet Standard chain for a user-added RPC, or undefined for a built-in
 * cluster. Since `@solana/connector` 0.3.0 a cluster id the connector does not
 * recognise (our `custom-*` ids) yields no Kit signer at all, so a custom RPC
 * must name its chain explicitly: the one for the network it was added under.
 */
function useCustomClusterChain(): `solana:${string}` | undefined {
    const { cluster } = useConnector();
    const customRpcs = useRpcStore(state => state.customRpcs);
    if (!cluster || BUILTIN_CLUSTERS.some(c => c.id === cluster.id)) return undefined;
    const custom = customRpcs.find(rpc => rpc.id === cluster.id);
    return custom ? CLUSTER_ID_BY_NETWORK[custom.network] : undefined;
}

/**
 * Creates a transaction modifying signer from the Solana connector
 * Uses the connector's native kit-compatible transaction signer
 */
export function useConnectorSigner(): TransactionModifyingSigner<string> | null {
    const chain = useCustomClusterChain();
    const { signer } = useKitTransactionSigner(chain ? { chain } : undefined);
    // Cast through unknown to bridge the generic signature difference between
    // @solana/connector's signer type and @solana/kit's TransactionModifyingSigner
    return signer as unknown as TransactionModifyingSigner<string> | null;
}
