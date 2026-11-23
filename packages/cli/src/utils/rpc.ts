import {
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    type Rpc,
    type SolanaRpcApi,
    type RpcSubscriptions,
    type SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { getSolanaConfig, type SolanaConfig } from './solana.js';

export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Resolves the RPC URL a command talks to: `--rpc-url`, then the Solana CLI config's
 * `json_rpc_url`, then devnet. `--rpc-url` must have no commander default, or the config is
 * never reached. `readConfig` is a seam for tests.
 */
export function resolveRpcUrl(
    rpcUrl?: string,
    readConfig: () => Pick<SolanaConfig, 'json_rpc_url'> | null = getSolanaConfig,
): string {
    return rpcUrl || readConfig()?.json_rpc_url || DEVNET_RPC_URL;
}

function getWsUrl(rpcUrl?: string): string {
    const url = resolveRpcUrl(rpcUrl);

    // Handle localhost special case (Solana validator uses different ports for HTTP and WS)
    const LOCALHOST_RPC_URL = 'http://127.0.0.1:8899';
    const LOCALHOST_WS_URL = 'ws://127.0.0.1:8900';

    if (url === LOCALHOST_RPC_URL || url === 'http://localhost:8899') {
        return LOCALHOST_WS_URL;
    }

    try {
        const urlObj = new URL(url);
        urlObj.protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
        return urlObj.toString();
    } catch {
        // Fallback for invalid URLs
        return url.replace('https://', 'wss://').replace('http://', 'ws://');
    }
}

export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
    const url = resolveRpcUrl(rpcUrl);
    return createSolanaRpc(url);
}

export function createRpcSubscriptions(rpcUrl?: string): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
    const wsUrl = getWsUrl(rpcUrl);
    return createSolanaRpcSubscriptions(wsUrl);
}

// Note: createSolanaClient removed - use createSolanaRpc instead
