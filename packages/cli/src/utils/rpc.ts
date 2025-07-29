import {
  createSolanaRpc,
  createSolanaClient as createClient,
  type Rpc,
  type SolanaRpcApi,
} from 'gill';
import { getSolanaConfig } from './solana.js';

export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
  const url =
    rpcUrl ||
    getSolanaConfig()?.json_rpc_url ||
    'https://api.devnet.solana.com';
  return createSolanaRpc(url);
}

export function createSolanaClient(rpcUrl?: string) {
  const url =
    rpcUrl ||
    getSolanaConfig()?.json_rpc_url ||
    'https://api.devnet.solana.com';
  return createClient({ urlOrMoniker: url });
}
