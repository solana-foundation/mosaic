import { Token } from '../issuance';
import type {
  Rpc,
  Address,
  SolanaRpcApi,
  FullTransaction,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionSigner,
  TransactionWithBlockhashLifetime,
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
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param metadataAuthority - The address with authority over the metadata.
 * @param pausableAuthority - The address with authority over the pausable functionality.
 * @param confidentialBalancesAuthority - The address with authority over the confidential balances extension.
 * @param permanentDelegateAuthority - The address with authority over the permanent delegate.
 * @returns A promise that resolves to a FullTransaction object for initializing the arcade token mint.
 */
export const createArcadeTokenInitTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  metadataAuthority?: Address,
  pausableAuthority?: Address,
  confidentialBalancesAuthority?: Address,
  permanentDelegateAuthority?: Address
): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const tx = await new Token()
    .withMetadata({
      mintAddress: mintSigner.address,
      authority: metadataAuthority || mintAuthority,
      metadata: {
        name,
        symbol,
        uri,
      },
      // TODO: add additional metadata
      additionalMetadata: new Map(),
    })
    .withPausable(pausableAuthority || mintAuthority)
    .withDefaultAccountState(true)
    .withConfidentialBalances(confidentialBalancesAuthority || mintAuthority)
    .withPermanentDelegate(permanentDelegateAuthority || mintAuthority)
    .buildTransaction({
      rpc,
      decimals,
      authority: mintAuthority,
      mint: mintSigner,
      feePayer: feePayerSigner,
    });

  return tx;
};
