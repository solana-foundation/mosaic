import { Token } from '../issuance';
import type {
  Rpc,
  Address,
  SolanaRpcApi,
  FullTransaction,
  TransactionMessageWithFeePayer,
  TransactionVersion,
} from 'gill';
import { createNoopSigner } from 'gill';

/**
 * Creates a transaction to initialize a new arcade token mint on Solana with common arcade token features.
 *
 * This function configures the mint with metadata, pausable functionality, default account state,
 * confidential balances, and a permanent delegate. It returns a transaction ready to be signed and sent to the network.
 * Arcade tokens are close loop tokens that have an explicit allowlist.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the arcade token.
 * @param symbol - The symbol of the arcade token.
 * @param decimals - The number of decimals for the arcade token.
 * @param uri - The URI pointing to the arcade token's metadata.
 * @param authority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @returns A promise that resolves to a FullTransaction object for initializing the stablecoin mint.
 */
export const createArcadeTokenInitTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  authority: Address,
  mint: Address,
  feePayer: Address
): Promise<
  FullTransaction<TransactionVersion, TransactionMessageWithFeePayer>
> => {
  const tx = await new Token()
    .withMetadata({
      mintAddress: mint,
      authority: authority,
      metadata: {
        name,
        symbol,
        uri,
      },
      // TODO: add additional metadata
      additionalMetadata: new Map(),
    })
    .withPausable(authority)
    .withDefaultAccountState(true)
    .withConfidentialBalances(authority)
    .withPermanentDelegate(authority)
    .buildTransaction({
      rpc,
      decimals,
      authority,
      mint: createNoopSigner(mint),
      feePayer: createNoopSigner(feePayer),
    });

  return tx;
};
