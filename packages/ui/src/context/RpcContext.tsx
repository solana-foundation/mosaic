'use client';
import {
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApiMainnet,
  type SolanaRpcSubscriptionsApi,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  devnet,
} from 'gill';
import { createContext } from 'react';

export const RpcContext = createContext<{
  rpc: Rpc<SolanaRpcApiMainnet>; // Limit the API to only those methods found on Mainnet (ie. not `requestAirdrop`)
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}>({
  rpc: createSolanaRpc(devnet('https://api.devnet.solana.com')),
  rpcSubscriptions: createSolanaRpcSubscriptions(
    devnet('wss://api.devnet.solana.com')
  ),
});
