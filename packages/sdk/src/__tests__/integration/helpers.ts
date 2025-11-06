import type {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionWithBlockhashLifetime,
  FullTransaction,
  Commitment,
  Signature,
  KeyPairSigner,
} from 'gill';
import {
  getSignatureFromTransaction,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
} from 'gill';
import type { Client } from './setup';
import {
  getAssociatedTokenAccountAddress,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs';

export const DEFAULT_TIMEOUT = 60000;
export const DEFAULT_COMMITMENT = 'processed';

export const describeSkipIf = (condition?: boolean) =>
  condition ? describe.skip : describe;

/**
 * Submit a transaction and wait for confirmation
 */
export async function sendAndConfirmTransaction(
  client: Client,
  tx: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >,
  commitment: Commitment = DEFAULT_COMMITMENT,
  skipPreflight = true
): Promise<Signature> {
  const { rpc } = client;

  // Sign transaction
  const signedTransaction = await signTransactionMessageWithSigners(tx);

  // Get signature and wire transaction
  const signature = getSignatureFromTransaction(signedTransaction);
  await sendAndConfirmTransactionFactory(client)(signedTransaction, {
    commitment,
    skipPreflight,
  });

  return signature;
}

/**
 * Get token balance for a wallet
 */
export async function getBalance(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address,
  mint: Address
): Promise<bigint> {
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    wallet,
    TOKEN_2022_PROGRAM_ADDRESS
  );

  const accountInfo = await rpc
    .getAccountInfo(ata, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo?.value?.data) {
    return 0n;
  }

  const parsed = (accountInfo.value.data as any).parsed?.info;
  return BigInt(parsed?.tokenAmount?.amount ?? '0');
}

/**
 * Check if an account is frozen
 */
export async function isAccountFrozen(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address,
  mint: Address
): Promise<boolean> {
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    wallet,
    TOKEN_2022_PROGRAM_ADDRESS
  );

  const accountInfo = await rpc
    .getAccountInfo(ata, { encoding: 'jsonParsed' })
    .send();

  if (!accountInfo?.value?.data) {
    return false;
  }

  const parsed = (accountInfo.value.data as any).parsed?.info;
  return parsed?.state === 'frozen';
}

/**
 * Assert transaction succeeded
 */
export function assertTxSuccess(signature: string): void {
  expect(signature).toBeDefined();
  expect(typeof signature).toBe('string');
  expect(signature.length).toBeGreaterThan(0);
}

/**
 * Assert transaction fails
 */
export async function assertTxFailure(
  client: Client,
  transactionToThrow: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
): Promise<void> {
  await expect(
    sendAndConfirmTransaction(client, transactionToThrow)
  ).rejects.toThrow();
}

// ============================================================================
// Test Helper Functions - Reduce Boilerplate
// ============================================================================

import type { TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import { Token } from '../../issuance';
import {
  inspectToken,
  type AclMode,
  type ScaledUiAmountInfo,
  type TokenAuthorities,
  type TokenExtension,
  type TokenSupplyInfo,
  type TokenType,
} from '../../inspection';
import type { AuthorityType } from 'gill/programs/token';
import {
  getUpdateAuthorityTransaction,
  getRemoveAuthorityTransaction,
} from '../../administration';

interface CreateTestTokenOptions {
  name?: string;
  symbol?: string;
  uri?: string;
  decimals?: number;
  metadataAuthority?: Address;
  mintAuthority?: TransactionSigner<string>;
  freezeAuthority?: Address;
  pausableAuthority?: Address;
  payer: TransactionSigner<string>;
  permanentDelegate?: Address;
  commitment?: Commitment;
  defaultAccountState?: { initialStateInitialized: boolean };
  confidentialBalancesAuthority?: Address;
  scaledUiAmount?: {
    authority: Address;
    multiplier?: number;
    newMultiplierEffectiveTimestamp?: bigint | number;
    newMultiplier?: number;
  };
  mint?: KeyPairSigner<string>;
}

/**
 * Creates a basic test token with optional metadata, pausable, default account state, confidential balances, scaled UI amount, and permanent delegate
 * Returns the mint signer and signature
 */
export async function createTestTokenWithAssertions({
  client,
  options,
  assertions,
  transactionAssertions,
}: {
  client: Client;
  options: CreateTestTokenOptions;
  assertions?: AssertTokenOptions;
  transactionAssertions?: AssertTransactionOptions;
}): Promise<{ mint: Address; signature: Signature }> {
  const mint = options.mint || (await generateKeyPairSigner());
  let tokenBuilder = new Token();

  // Add metadata if metadata authority is provided
  if (options.metadataAuthority) {
    tokenBuilder = tokenBuilder.withMetadata({
      mintAddress: mint.address,
      authority: options.metadataAuthority,
      metadata: {
        name: options.name || 'Test Token',
        symbol: options.symbol || 'TEST',
        uri: options.uri || 'https://example.com/test.json',
      },
      additionalMetadata: new Map(),
    });
  }

  // Add permanent delegate if provided
  if (options.permanentDelegate) {
    tokenBuilder = tokenBuilder.withPermanentDelegate(
      options.permanentDelegate
    );
  }

  // Add pausable if pausable authority is provided
  if (options.pausableAuthority) {
    tokenBuilder = tokenBuilder.withPausable(options.pausableAuthority);
  }

  // Add default account state if provided
  if (options.defaultAccountState) {
    tokenBuilder = tokenBuilder.withDefaultAccountState(
      options.defaultAccountState.initialStateInitialized
    );
  }

  // Add confidential balances if provided
  if (options.confidentialBalancesAuthority) {
    tokenBuilder = tokenBuilder.withConfidentialBalances(
      options.confidentialBalancesAuthority
    );
  }

  // Add scaled UI amount if provided
  if (options.scaledUiAmount) {
    tokenBuilder = tokenBuilder.withScaledUiAmount(
      options.scaledUiAmount.authority,
      options.scaledUiAmount.multiplier,
      options.scaledUiAmount.newMultiplierEffectiveTimestamp,
      options.scaledUiAmount.newMultiplier
    );
  }

  const tx = await tokenBuilder.buildTransaction({
    rpc: client.rpc,
    decimals: options.decimals || 6,
    mintAuthority: options.mintAuthority,
    freezeAuthority: options.freezeAuthority,
    mint,
    feePayer: options.payer,
  });

  if (transactionAssertions?.shouldThrow) {
    await assertTxFailure(client, tx);
  }

  const signature = await sendAndConfirmTransaction(
    client,
    tx,
    options.commitment || DEFAULT_COMMITMENT
  );
  assertTxSuccess(signature);

  if (assertions) {
    await assertToken(client, mint.address, assertions, options.commitment);
  }

  return { mint: mint.address, signature };
}

interface AssertTokenOptions {
  exists?: boolean;
  supplyInfo?: TokenSupplyInfo;
  authorities?: TokenAuthorities;
  extensions?: TokenExtension[];
  tokenType?: TokenType;
  isPausable?: boolean;
  aclMode?: AclMode;
  enableSrfc37?: boolean;
  scaledUiAmount?: ScaledUiAmountInfo;
}

interface AssertTransactionOptions {
  shouldThrow?: boolean;
}

export async function assertToken(
  client: Client,
  mintAddress: Address,
  expected: AssertTokenOptions,
  commitment: Commitment = DEFAULT_COMMITMENT
): Promise<void> {
  const exists = expected.exists ?? true;
  const tokenInspection = inspectToken(client.rpc, mintAddress, commitment);

  // Verify token status
  if (!exists) {
    await expect(tokenInspection).rejects.toThrow();
    return;
  }
  const inspection = await tokenInspection;
  expect(inspection).toBeDefined();
  expect(inspection.programId).toBe(TOKEN_2022_PROGRAM_ADDRESS);
  expect(inspection.isToken2022).toBe(true);

  // Verify authorities
  if (expected.authorities) {
    for (const authority of Object.keys(expected.authorities) as Array<
      keyof TokenAuthorities
    >) {
      expect(inspection.authorities[authority]).toBe(
        expected.authorities[authority]
      );
    }
  }

  // Verify token type
  if (expected.tokenType) {
    expect(inspection.detectedType).toBe(expected.tokenType);
  }

  // Verify supply info
  if (expected.supplyInfo) {
    expect(inspection.supplyInfo).toEqual(expected.supplyInfo);
  }

  // Verify extensions
  if (expected.extensions) {
    for (const extension of expected.extensions) {
      expect(inspection.extensions).toContainEqual(extension);
    }
  }

  // Verify is pausable
  if (expected.isPausable !== undefined) {
    expect(inspection.isPausable).toBe(expected.isPausable);
  }

  // Verify acl mode
  if (expected.aclMode) {
    expect(inspection.aclMode).toBe(expected.aclMode);
  }

  // Verify enable Srfc37
  if (expected.enableSrfc37 !== undefined) {
    expect(inspection.enableSrfc37).toBe(expected.enableSrfc37);
  }

  // Verify scaled UI amount
  if (expected.scaledUiAmount) {
    expect(inspection.scaledUiAmount).toEqual(expected.scaledUiAmount);
  }
}

interface UpdateAuthorityOptions {
  mint: Address;
  role: AuthorityType | 'Metadata';
  currentAuthority: TransactionSigner<string>;
  newAuthority: Address;
  payer: TransactionSigner<string>;
  commitment?: Commitment;
}

/**
 * Update an authority on a mint (combines transaction creation, sending, and verification)
 */
export async function updateAuthorityWithAssertions({
  client,
  options,
  assertions,
  transactionAssertions,
}: {
  client: Client;
  options: UpdateAuthorityOptions;
  assertions?: AssertTokenOptions;
  transactionAssertions?: AssertTransactionOptions;
}): Promise<Signature> {
  const updateTx = await getUpdateAuthorityTransaction({
    rpc: client.rpc,
    payer: options.payer,
    mint: options.mint,
    role: options.role,
    currentAuthority: options.currentAuthority,
    newAuthority: options.newAuthority,
  });

  if (transactionAssertions?.shouldThrow) {
    await assertTxFailure(client, updateTx);
  }

  const signature = await sendAndConfirmTransaction(
    client,
    updateTx,
    options.commitment || DEFAULT_COMMITMENT
  );
  assertTxSuccess(signature);

  if (assertions) {
    await assertToken(client, options.mint, assertions, options.commitment);
  }

  return signature;
}

interface RemoveAuthorityOptions {
  mint: Address;
  role: AuthorityType;
  currentAuthority: TransactionSigner<string>;
  payer: TransactionSigner<string>;
  commitment?: Commitment;
}

/**
 * Remove an authority from a mint (set to None)
 */
export async function removeAuthorityWithAssertions({
  client,
  options,
  assertions,
  transactionAssertions,
}: {
  client: Client;
  options: RemoveAuthorityOptions;
  assertions?: AssertTokenOptions;
  transactionAssertions?: AssertTransactionOptions;
}): Promise<Signature> {
  const removeTx = await getRemoveAuthorityTransaction({
    rpc: client.rpc,
    payer: options.payer,
    mint: options.mint,
    role: options.role,
    currentAuthority: options.currentAuthority,
  });

  if (transactionAssertions?.shouldThrow) {
    await assertTxFailure(client, removeTx);
  }

  const signature = await sendAndConfirmTransaction(
    client,
    removeTx,
    options.commitment || DEFAULT_COMMITMENT
  );
  assertTxSuccess(signature);

  if (assertions) {
    await assertToken(client, options.mint, assertions, options.commitment);
  }

  return signature;
}
