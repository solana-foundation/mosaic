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
import { createNoopSigner, createTransaction } from 'gill';
import { Mode } from '@mosaic/abl';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getCreateConfigInstructions } from '../ebalts/createConfig';
import { getSetGatingProgramInstructions } from '../ebalts/setGatingProgram';
import { getEnablePermissionlessThawInstructions } from '../ebalts/enablePermissionlessThaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/setExtraMetas';

/**
 * Creates a transaction to initialize a new tokenized security mint on Solana.
 * Matches the stablecoin template extensions, plus Scaled UI Amount.
 */
export const createTokenizedSecurityInitTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  options?: {
    aclMode?: 'allowlist' | 'blocklist';
    metadataAuthority?: Address;
    pausableAuthority?: Address;
    confidentialBalancesAuthority?: Address;
    permanentDelegateAuthority?: Address;
    enableSrfc37?: boolean;
    scaledUiAmount?: {
      authority?: Address;
      multiplier?: number;
      newMultiplierEffectiveTimestamp?: bigint | number;
      newMultiplier?: number;
    };
  }
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

  const aclMode = options?.aclMode ?? 'blocklist';
  const useSrfc37 = options?.enableSrfc37 ?? false;
  const metadataAuthority = options?.metadataAuthority || mintAuthority;
  const pausableAuthority = options?.pausableAuthority || mintAuthority;
  const confidentialBalancesAuthority =
    options?.confidentialBalancesAuthority || mintAuthority;
  const permanentDelegateAuthority =
    options?.permanentDelegateAuthority || mintAuthority;

  let tokenBuilder = new Token()
    .withMetadata({
      mintAddress: mintSigner.address,
      authority: metadataAuthority,
      metadata: {
        name,
        symbol,
        uri,
      },
      additionalMetadata: new Map(),
    })
    .withPausable(pausableAuthority)
    .withDefaultAccountState(!useSrfc37)
    .withConfidentialBalances(confidentialBalancesAuthority)
    .withPermanentDelegate(permanentDelegateAuthority);

  // Add Scaled UI Amount extension
  tokenBuilder = tokenBuilder.withScaledUiAmount(
    options?.scaledUiAmount?.authority || mintAuthority,
    options?.scaledUiAmount?.multiplier ?? 1,
    options?.scaledUiAmount?.newMultiplierEffectiveTimestamp ?? 0n,
    options?.scaledUiAmount?.newMultiplier ?? 1
  );

  const instructions = await tokenBuilder.buildInstructions({
    rpc,
    decimals,
    authority: mintAuthority,
    mint: mintSigner,
    feePayer: feePayerSigner,
  });

  if (mintAuthority !== feePayerSigner.address || !useSrfc37) {
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

  const setGatingProgramInstructions = await getSetGatingProgramInstructions({
    authority: feePayerSigner,
    mint: mintSigner.address,
    gatingProgram: ABL_PROGRAM_ID,
  });

  const enablePermissionlessThawInstructions =
    await getEnablePermissionlessThawInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
    });

  const { instructions: createListInstructions, listConfig } =
    await getCreateListInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
      mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });

  const setExtraMetasInstructions = await getSetExtraMetasInstructions({
    authority: feePayerSigner,
    mint: mintSigner.address,
    list: listConfig,
  });

  instructions.push(...createConfigInstructions);
  instructions.push(...setGatingProgramInstructions);
  instructions.push(...enablePermissionlessThawInstructions);
  instructions.push(...createListInstructions);
  instructions.push(...setExtraMetasInstructions);

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};
