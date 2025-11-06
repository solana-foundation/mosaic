import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import { AuthorityType } from 'gill/programs/token';
import {
  sendAndConfirmTransaction,
  assertTxSuccess,
  assertTxFailure,
  DEFAULT_TIMEOUT,
  DEFAULT_COMMITMENT,
  assertToken,
  describeSkipIf,
} from './helpers';
import { Token } from '../../issuance';
import { createMintToTransaction } from '../../management';
import {
  getUpdateAuthorityTransaction,
  getRemoveAuthorityTransaction,
} from '../../administration';

describeSkipIf()('Administration Integration Tests', () => {
  let client: Client;
  let mintAuthority: TransactionSigner<string>;
  let freezeAuthority: TransactionSigner<string>;
  let payer: TransactionSigner<string>;
  let mint: KeyPairSigner<string>;
  let newAuthority: KeyPairSigner<string>;

  beforeAll(async () => {
    const testSuite = await setupTestSuite();
    client = testSuite.client;
    mintAuthority = testSuite.mintAuthority;
    freezeAuthority = testSuite.freezeAuthority;
    payer = testSuite.payer;
  });

  beforeEach(async () => {
    mint = await generateKeyPairSigner();
    newAuthority = await generateKeyPairSigner();
  });

  describe('Update Authorities', () => {
    it(
      'should transfer mint authority',
      async () => {
        // Given: A token with mint authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        const createSig = await sendAndConfirmTransaction(
          client,
          createTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(createSig);

        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: mintAuthority.address },
        });

        // When: Transferring mint authority to new address
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.MintTokens,
          currentAuthority: mintAuthority,
          newAuthority: newAuthority.address,
        });

        const updateSig = await sendAndConfirmTransaction(
          client,
          updateTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(updateSig);

        // Then: New authority is set
        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: newAuthority.address },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer freeze authority',
      async () => {
        // Given: A token with freeze authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: freezeAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        await assertToken(client.rpc, mint.address, {
          authorities: { freezeAuthority: freezeAuthority.address },
        });

        // When: Transferring freeze authority to new address
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.FreezeAccount,
          currentAuthority: freezeAuthority,
          newAuthority: newAuthority.address,
        });

        const updateSig = await sendAndConfirmTransaction(
          client,
          updateTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(updateSig);

        // Then: New freeze authority is set
        await assertToken(client.rpc, mint.address, {
          authorities: { freezeAuthority: newAuthority.address },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer permanent delegate',
      async () => {
        const permanentDelegate = await generateKeyPairSigner();

        // Given: A token with permanent delegate
        const tokenBuilder = new Token()
          .withMetadata({
            mintAddress: mint.address,
            authority: mintAuthority.address,
            metadata: {
              name: 'Test Token',
              symbol: 'TEST',
              uri: 'https://example.com/test.json',
            },
            additionalMetadata: new Map(),
          })
          .withPermanentDelegate(permanentDelegate.address);

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        await assertToken(client.rpc, mint.address, {
          authorities: { permanentDelegate: permanentDelegate.address },
          extensions: [
            {
              name: 'PermanentDelegate',
              details: { delegate: permanentDelegate.address },
            },
          ],
        });

        // When: Transferring permanent delegate to new address
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.PermanentDelegate,
          currentAuthority: permanentDelegate,
          newAuthority: newAuthority.address,
        });

        const updateSig = await sendAndConfirmTransaction(
          client,
          updateTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(updateSig);

        // Then: New permanent delegate is set
        await assertToken(client.rpc, mint.address, {
          authorities: { permanentDelegate: newAuthority.address },
          extensions: [
            {
              name: 'PermanentDelegate',
              details: { delegate: newAuthority.address },
            },
          ],
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer metadata authority',
      async () => {
        // Given: A token with metadata
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        // When: Transferring metadata authority to new address
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: 'Metadata',
          currentAuthority: mintAuthority,
          newAuthority: newAuthority.address,
        });

        const updateSig = await sendAndConfirmTransaction(
          client,
          updateTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(updateSig);

        // Then: New metadata authority is set
        await assertToken(client.rpc, mint.address, {
          authorities: { metadataAuthority: newAuthority.address },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should remove mint authority',
      async () => {
        // Given: A token with mint authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: mintAuthority.address },
        });

        // When: Removing mint authority
        const removeTx = await getRemoveAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.MintTokens,
          currentAuthority: mintAuthority,
        });

        const removeSig = await sendAndConfirmTransaction(
          client,
          removeTx,
          DEFAULT_COMMITMENT
        );
        assertTxSuccess(removeSig);

        // Then: Mint authority is removed
        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: null },
        });

        // And: Old authority cannot mint tokens
        const mintTx = await createMintToTransaction(
          client.rpc,
          mint.address,
          payer.address,
          1000000,
          mintAuthority,
          payer
        );

        await assertTxFailure(client, mintTx);
      },
      DEFAULT_TIMEOUT
    );
  });

  describe('Authority Validation', () => {
    it(
      'should verify only current authority can update',
      async () => {
        const unauthorizedSigner = await generateKeyPairSigner();

        // Given: A token with mint authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: mintAuthority.address },
        });

        // When: Trying to update with unauthorized signer
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.MintTokens,
          currentAuthority: unauthorizedSigner,
          newAuthority: newAuthority.address,
        });

        // Then: Transaction fails
        await assertTxFailure(client, updateTx);

        // And: Authority remains unchanged
        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: mintAuthority.address },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should verify new authority can perform operations',
      async () => {
        // Given: A token with mint authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        // When: Transferring mint authority
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.MintTokens,
          currentAuthority: mintAuthority,
          newAuthority: newAuthority.address,
        });

        await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);

        await assertToken(client.rpc, mint.address, {
          authorities: { mintAuthority: newAuthority.address },
        });

        // Then: New authority can mint tokens
        const mintTx = await createMintToTransaction(
          client.rpc,
          mint.address,
          payer.address,
          1000000,
          newAuthority,
          payer
        );

        const mintSig = await sendAndConfirmTransaction(client, mintTx);
        assertTxSuccess(mintSig);
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should verify old authority cannot perform operations after transfer',
      async () => {
        // Given: A token with mint authority
        const tokenBuilder = new Token().withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Test Token',
            symbol: 'TEST',
            uri: 'https://example.com/test.json',
          },
          additionalMetadata: new Map(),
        });

        const createTx = await tokenBuilder.buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

        await sendAndConfirmTransaction(client, createTx, DEFAULT_COMMITMENT);

        // When: Transferring mint authority
        const updateTx = await getUpdateAuthorityTransaction({
          rpc: client.rpc,
          payer,
          mint: mint.address,
          role: AuthorityType.MintTokens,
          currentAuthority: mintAuthority,
          newAuthority: newAuthority.address,
        });

        await sendAndConfirmTransaction(client, updateTx, DEFAULT_COMMITMENT);

        // Then: Old authority cannot mint tokens
        const mintTx = await createMintToTransaction(
          client.rpc,
          mint.address,
          payer.address,
          1000000,
          mintAuthority,
          payer
        );

        await assertTxFailure(client, mintTx);
      },
      DEFAULT_TIMEOUT
    );
  });
});
