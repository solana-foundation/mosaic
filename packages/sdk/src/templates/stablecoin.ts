import { Token } from '../issuance';
import type {
  Rpc,
  Address,
  SolanaRpcApi,
  FullTransaction,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionWithBlockhashLifetime,
  TransactionSigner,
} from 'gill';
import { createNoopSigner, createTransaction } from 'gill';
import { Mode } from '@token-acl/abl-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getCreateConfigInstructions } from '../token-acl/createConfig';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enablePermissionlessThaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/setExtraMetas';

/**
 * Creates a transaction to initialize a new stablecoin mint on Solana with common stablecoin features.
 *
 * This function configures the mint with metadata, pausable functionality, default account state,
 * confidential balances, and a permanent delegate. It returns a transaction ready to be signed and sent to the network.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the stablecoin.
 * @param symbol - The symbol of the stablecoin.
 * @param decimals - The number of decimals for the stablecoin.
 * @param uri - The URI pointing to the stablecoin's metadata.
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param metadataAuthority - The address with authority over the metadata.
 * @param pausableAuthority - The address with authority over the pausable functionality.
 * @param confidentialBalancesAuthority - The address with authority over the confidential balances extension.
 * @param permanentDelegateAuthority - The address with authority over the permanent delegate.
 * @returns A promise that resolves to a FullTransaction object for initializing the stablecoin mint.
 */
export const createStablecoinInitTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  aclMode?: 'allowlist' | 'blocklist',
  metadataAuthority?: Address,
  pausableAuthority?: Address,
  confidentialBalancesAuthority?: Address,
  permanentDelegateAuthority?: Address,
  enableSrfc37?: boolean
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

  aclMode = aclMode || 'blocklist';
  const useSrfc37 = enableSrfc37 ?? false;

  // 1. create token
  const instructions = await new Token()
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
    .withDefaultAccountState(!useSrfc37)
    .withConfidentialBalances(confidentialBalancesAuthority || mintAuthority)
    .withPermanentDelegate(permanentDelegateAuthority || mintAuthority)
    .buildInstructions({
      rpc,
      decimals,
      authority: mintAuthority,
      mint: mintSigner,
      feePayer: feePayerSigner,
    });

  // 2. create mintConfig (Token ACL) - only if SRFC-37 is enabled
  if (mintAuthority !== feePayerSigner.address || !useSrfc37) {
    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return createTransaction({
      feePayer,
      version: 'legacy',
      latestBlockhash,
      instructions,
    });
  }

  const { instructions: createConfigInstructions } =
    await getCreateConfigInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
      gatingProgram: ABL_PROGRAM_ID,
    });

  // 3. enable permissionless thaw (Token ACL)
  const enablePermissionlessThawInstructions =
    await getEnablePermissionlessThawInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
    });

  // 4. create list (abl)
  const { instructions: createListInstructions, listConfig } =
    await getCreateListInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
      mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });

  // 5. set extra metas (abl): this is how we can change the list associated with a given mint
  const setExtraMetasInstructions = await getSetExtraMetasInstructions({
    authority: feePayerSigner,
    mint: mintSigner.address,
    lists: [listConfig],
  });

  instructions.push(...createConfigInstructions);
  instructions.push(...enablePermissionlessThawInstructions);
  instructions.push(...createListInstructions);
  instructions.push(...setExtraMetasInstructions);

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};
