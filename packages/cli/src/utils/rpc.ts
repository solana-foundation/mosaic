import {
  createSolanaRpc,
  createSolanaClient as createClient,
  type Rpc,
  type SolanaRpcApi,
} from 'gill';
import { getSolanaConfig } from './solana.js';

function getRpcUrl(rpcUrl?: string) {
  const url =
    rpcUrl ||
    getSolanaConfig()?.json_rpc_url ||
    'https://api.devnet.solana.com';
  return url;
}

export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
  const url = getRpcUrl(rpcUrl);
  return createSolanaRpc(url);
}

export function createSolanaClient(rpcUrl?: string) {
  const url = getRpcUrl(rpcUrl);
  return createClient({ urlOrMoniker: url });
}
