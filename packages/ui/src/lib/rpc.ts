import {
  createSolanaRpc,
  createSolanaClient as createClient,
  type Rpc,
  type SolanaRpcApi,
} from 'gill';

export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
  const url = rpcUrl || 'https://api.devnet.solana.com';
  return createSolanaRpc(url);
}

export function createSolanaClient(rpcUrl?: string) {
  const url = rpcUrl || 'https://api.devnet.solana.com';
  return createClient({ urlOrMoniker: url });
}
