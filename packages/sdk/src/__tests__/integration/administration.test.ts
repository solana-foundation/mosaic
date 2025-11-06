import setupTestSuite from './setup';
import type { Client } from './setup';
import type { TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import { AuthorityType } from 'gill/programs/token';
import { Token } from '../../issuance';
import {
  getRemoveAuthorityTransaction,
  getUpdateAuthorityTransaction,
} from '../../administration';
import { inspectToken } from '../../inspection';
import {
  sendAndConfirmTransaction,
  assertTxSuccess,
  assertTxFailure,
} from './helpers';
import { describeSkipIf } from './helpers';
import { createMintToTransaction } from '../../management';

describeSkipIf()('Administration Integration Tests', () => {
  let client: Client;
  let mintAuthority: TransactionSigner<string>;
  let freezeAuthority: TransactionSigner<string>;
  let payer: TransactionSigner<string>;

  beforeAll(async () => {
    const testSuite = await setupTestSuite();
    client = testSuite.client;
    mintAuthority = testSuite.mintAuthority;
    freezeAuthority = testSuite.freezeAuthority;
    payer = testSuite.payer;
  });

  describe('Update Authorities', () => {
    it('should transfer mint authority', async () => {
      // Create a simple token with metadata
      const mint = await generateKeyPairSigner();
      const newMintAuthority = await generateKeyPairSigner();
      const tx = await new Token()
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
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(
        client,
        tx,
        'processed'
      );
      assertTxSuccess(createSig);

      // Verify initial mint authority
      const inspection1 = await inspectToken(
        client.rpc,
        mint.address,
        'processed'
      );
      expect(inspection1.authorities.mintAuthority).toBe(mintAuthority.address);

      // Transfer mint authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: mintAuthority,
        newAuthority: newMintAuthority.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify new mint authority
      const inspection2 = await inspectToken(client.rpc, mint.address);
      expect(inspection2.authorities.mintAuthority).toBe(
        newMintAuthority.address
      );
    }, 60000);

    it('should transfer freeze authority', async () => {
      // Create a token with freeze authority
      const mint = await generateKeyPairSigner();
      const newFreezeAuthority = await generateKeyPairSigner();

      // In Token class, authority is used as freezeAuthority
      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: freezeAuthority.address,
          metadata: {
            name: 'Freezable Token',
            symbol: 'FREEZE',
            uri: 'https://example.com/freeze.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Verify initial freeze authority
      const inspection1 = await inspectToken(client.rpc, mint.address);
      expect(inspection1.authorities.freezeAuthority).toBe(
        freezeAuthority.address
      );

      // Transfer freeze authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.FreezeAccount,
        currentAuthority: freezeAuthority,
        newAuthority: newFreezeAuthority.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify new freeze authority
      const inspection2 = await inspectToken(client.rpc, mint.address);
      expect(inspection2.authorities.freezeAuthority).toBe(
        newFreezeAuthority.address
      );
    }, 60000);

    it('should transfer permanent delegate', async () => {
      // Create a token with permanent delegate
      const mint = await generateKeyPairSigner();
      const permanentDelegate = await generateKeyPairSigner();
      const newPermanentDelegate = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Delegated Token',
            symbol: 'DELEG',
            uri: 'https://example.com/delegate.json',
          },
          additionalMetadata: new Map(),
        })
        .withPermanentDelegate(permanentDelegate.address)
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Verify initial permanent delegate
      const inspection1 = await inspectToken(client.rpc, mint.address);
      expect(inspection1.authorities.permanentDelegate).toBe(
        permanentDelegate.address
      );

      // Transfer permanent delegate authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.PermanentDelegate,
        currentAuthority: permanentDelegate,
        newAuthority: newPermanentDelegate.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify new permanent delegate
      const inspection2 = await inspectToken(client.rpc, mint.address);
      expect(inspection2.authorities.permanentDelegate).toBe(
        newPermanentDelegate.address
      );
    }, 60000);

    it('should transfer metadata authority', async () => {
      // Create a token with metadata
      const mint = await generateKeyPairSigner();
      const newMetadataAuthority = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Meta Token',
            symbol: 'META',
            uri: 'https://example.com/meta.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Verify initial metadata authority
      const inspection1 = await inspectToken(client.rpc, mint.address);
      expect(inspection1.authorities.metadataAuthority).toBe(
        mintAuthority.address
      );

      // Transfer metadata authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: 'Metadata',
        currentAuthority: mintAuthority,
        newAuthority: newMetadataAuthority.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify new metadata authority
      const inspection2 = await inspectToken(client.rpc, mint.address);
      expect(inspection2.authorities.metadataAuthority).toBe(
        newMetadataAuthority.address
      );
    }, 60000);

    it('should remove mint authority', async () => {
      // Create a simple token
      const mint = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Close Authority Token',
            symbol: 'CLOSE',
            uri: 'https://example.com/close.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Verify initial mint authority exists
      const inspection1 = await inspectToken(client.rpc, mint.address);
      expect(inspection1.authorities.mintAuthority).toBe(mintAuthority.address);

      // Set mint authority to None (represented by null in the API)
      const updateTx = await getRemoveAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: mintAuthority,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify mint authority is now None
      const inspection2 = await inspectToken(client.rpc, mint.address);
      expect(inspection2.authorities.mintAuthority).toBeNull();

      // Try to use old authority - should fail
      const mintTransaction = await createMintToTransaction(
        client.rpc,
        mint.address,
        payer.address,
        1000000,
        mintAuthority,
        payer
      );

      await assertTxFailure(client, mintTransaction);
    }, 60000);
  });

  describe('Authority Validation', () => {
    it('should verify only current authority can update', async () => {
      // Create a token
      const mint = await generateKeyPairSigner();
      const unauthorizedSigner = await generateKeyPairSigner();
      const newAuthority = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Auth Test Token',
            symbol: 'AUTH',
            uri: 'https://example.com/auth.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Try to update authority with unauthorized signer - should fail
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: unauthorizedSigner,
        newAuthority: newAuthority.address,
      });

      await assertTxFailure(client, updateTx);

      // Verify authority unchanged
      const inspection = await inspectToken(client.rpc, mint.address);
      expect(inspection.authorities.mintAuthority).toBe(mintAuthority.address);
    }, 60000);

    it('should verify new authority can perform operations', async () => {
      // Create a token
      const mint = await generateKeyPairSigner();
      const newMintAuthority = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'New Auth Token',
            symbol: 'NEWAUTH',
            uri: 'https://example.com/newauth.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Transfer mint authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: mintAuthority,
        newAuthority: newMintAuthority.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Verify new authority can transfer it again
      const thirdAuthority = await generateKeyPairSigner();
      const updateTx2 = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: newMintAuthority,
        newAuthority: thirdAuthority.address,
      });

      const updateSig2 = await sendAndConfirmTransaction(client, updateTx2);
      assertTxSuccess(updateSig2);

      // Verify final authority
      const inspection = await inspectToken(client.rpc, mint.address);
      expect(inspection.authorities.mintAuthority).toBe(thirdAuthority.address);
    }, 60000);

    it('should verify old authority cannot perform operations after transfer', async () => {
      // Create a token
      const mint = await generateKeyPairSigner();
      const newMintAuthority = await generateKeyPairSigner();

      const tx = await new Token()
        .withMetadata({
          mintAddress: mint.address,
          authority: mintAuthority.address,
          metadata: {
            name: 'Old Auth Token',
            symbol: 'OLDAUTH',
            uri: 'https://example.com/oldauth.json',
          },
          additionalMetadata: new Map(),
        })
        .buildTransaction({
          rpc: client.rpc,
          decimals: 6,
          mintAuthority,
          freezeAuthority: freezeAuthority.address,
          mint,
          feePayer: payer,
        });

      const createSig = await sendAndConfirmTransaction(client, tx);
      assertTxSuccess(createSig);

      // Transfer mint authority
      const updateTx = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: mintAuthority,
        newAuthority: newMintAuthority.address,
      });

      const updateSig = await sendAndConfirmTransaction(client, updateTx);
      assertTxSuccess(updateSig);

      // Try to use old authority - should fail
      const anotherAuthority = await generateKeyPairSigner();
      const updateTx2 = await getUpdateAuthorityTransaction({
        rpc: client.rpc,
        payer,
        mint: mint.address,
        role: AuthorityType.MintTokens,
        currentAuthority: mintAuthority, // Old authority
        newAuthority: anotherAuthority.address,
      });

      await assertTxFailure(client, updateTx2);

      // Verify authority is still the new one
      const inspection = await inspectToken(client.rpc, mint.address);
      expect(inspection.authorities.mintAuthority).toBe(
        newMintAuthority.address
      );
    }, 60000);
  });
});
