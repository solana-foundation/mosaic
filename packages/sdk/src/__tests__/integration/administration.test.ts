import setupTestSuite from './setup';
import type { Client } from './setup';
import type { KeyPairSigner, TransactionSigner } from 'gill';
import { generateKeyPairSigner } from 'gill';
import { AuthorityType } from 'gill/programs/token';
import {
  sendAndConfirmTransaction,
  assertTxSuccess,
  assertTxFailure,
  createTestTokenWithAssertions,
  updateAuthorityWithAssertions,
  removeAuthorityWithAssertions,
  DEFAULT_TIMEOUT,
  DEFAULT_COMMITMENT,
  assertToken,
} from './helpers';
import { describeSkipIf } from './helpers';
import { createMintToTransaction } from '../../management';

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
        // Create a simple token with metadata
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
            commitment: DEFAULT_COMMITMENT,
          },
          assertions: {
            authorities: {
              mintAuthority: mintAuthority.address,
            },
          },
        });

        // Transfer mint authority
        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.MintTokens,
            currentAuthority: mintAuthority,
            newAuthority: newAuthority.address,
            payer,
            commitment: DEFAULT_COMMITMENT,
          },
          assertions: {
            authorities: {
              mintAuthority: newAuthority.address,
            },
          },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer freeze authority',
      async () => {
        // Create a token with freeze authority
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: freezeAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
            commitment: DEFAULT_COMMITMENT,
          },
          assertions: {
            authorities: {
              freezeAuthority: freezeAuthority.address,
            },
          },
        });

        // Transfer freeze authority
        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.FreezeAccount,
            currentAuthority: freezeAuthority,
            newAuthority: newAuthority.address,
            payer,
            commitment: DEFAULT_COMMITMENT,
          },
          assertions: {
            authorities: {
              freezeAuthority: newAuthority.address,
            },
          },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer permanent delegate',
      async () => {
        const permanentDelegate = await generateKeyPairSigner();
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
            permanentDelegate: permanentDelegate.address,
          },
          assertions: {
            authorities: {
              permanentDelegate: permanentDelegate.address,
            },
            extensions: [
              {
                name: 'PermanentDelegate',
                details: {
                  delegate: permanentDelegate.address,
                },
              },
            ],
          },
        });

        // Transfer permanent delegate authority
        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.PermanentDelegate,
            currentAuthority: permanentDelegate,
            newAuthority: newAuthority.address,
            payer,
          },
          assertions: {
            authorities: {
              permanentDelegate: newAuthority.address,
            },
            extensions: [
              {
                name: 'PermanentDelegate',
                details: {
                  delegate: newAuthority.address,
                },
              },
            ],
          },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should transfer metadata authority',
      async () => {
        // Create a token with metadata

        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
          },
        });

        // Transfer metadata authority
        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: 'Metadata',
            currentAuthority: mintAuthority,
            newAuthority: newAuthority.address,
            payer,
            commitment: DEFAULT_COMMITMENT,
          },
          assertions: {
            authorities: {
              metadataAuthority: newAuthority.address,
            },
          },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should remove mint authority',
      async () => {
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
          },
          assertions: {
            authorities: {
              mintAuthority: mintAuthority.address,
            },
          },
        });

        await removeAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.MintTokens,
            currentAuthority: mintAuthority,
            payer,
          },
          assertions: {
            authorities: {
              mintAuthority: null,
            },
          },
        });

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
      },
      DEFAULT_TIMEOUT
    );
  });

  describe('Authority Validation', () => {
    it(
      'should verify only current authority can update',
      async () => {
        const unauthorizedSigner = await generateKeyPairSigner();

        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
          },
          assertions: {
            authorities: {
              mintAuthority: mintAuthority.address,
            },
          },
        });

        // Try to update authority with unauthorized signer - should fail
        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.MintTokens,
            currentAuthority: unauthorizedSigner,
            newAuthority: newAuthority.address,
            payer,
          },
          transactionAssertions: {
            shouldThrow: true,
          },
        });

        await assertToken(client, mint.address, {
          authorities: {
            mintAuthority: mintAuthority.address, // unchanged
          },
        });
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should verify new authority can perform operations',
      async () => {
        // Create a token
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
          },
          assertions: {
            authorities: {
              mintAuthority: mintAuthority.address,
            },
          },
        });

        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.MintTokens,
            currentAuthority: mintAuthority,
            newAuthority: newAuthority.address,
            payer,
          },
          assertions: {
            authorities: {
              mintAuthority: newAuthority.address,
            },
          },
        });

        const mintTransaction = await createMintToTransaction(
          client.rpc,
          mint.address,
          payer.address,
          1000000,
          newAuthority, // new authority should be able to perform operations
          payer
        );
        const signature = await sendAndConfirmTransaction(
          client,
          mintTransaction
        );
        await assertTxSuccess(signature);
      },
      DEFAULT_TIMEOUT
    );

    it(
      'should verify old authority cannot perform operations after transfer',
      async () => {
        // Create a token
        await createTestTokenWithAssertions({
          client,
          options: {
            mint,
            payer,
            metadataAuthority: mintAuthority.address,
            mintAuthority: mintAuthority,
            freezeAuthority: freezeAuthority.address,
          },
          assertions: {
            authorities: {
              mintAuthority: mintAuthority.address,
            },
          },
        });

        await updateAuthorityWithAssertions({
          client,
          options: {
            mint: mint.address,
            role: AuthorityType.MintTokens,
            currentAuthority: mintAuthority,
            newAuthority: newAuthority.address,
            payer,
          },
          assertions: {
            authorities: {
              mintAuthority: newAuthority.address,
            },
          },
        });

        const mintTransaction = await createMintToTransaction(
          client.rpc,
          mint.address,
          payer.address,
          1000000,
          mintAuthority, // old authority should not be able to perform operations
          payer
        );
        await assertTxFailure(client, mintTransaction);
      },
      DEFAULT_TIMEOUT
    );
  });
});
