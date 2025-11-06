import { describeSkipIf } from './helpers';
import setupTestSuite from './setup';
import type { Client } from './setup';
import type { TransactionSigner } from 'gill';

// skipping abl, management, templates, token-acl until #43 merges

describeSkipIf()('ABL Integration Tests', () => {
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

  describe('List Management', () => {
    it('should create allowlist for mint', async () => {
      // TODO: Implement test
    });

    it('should create blocklist for mint', async () => {
      // TODO: Implement test
    });

    it('should get list configuration and wallets', async () => {
      // TODO: Implement test
    });

    it('should validate list PDA derivation', async () => {
      // TODO: Implement test
    });
  });

  describe('Wallet Operations', () => {
    it('should add wallet to allowlist', async () => {
      // TODO: Implement test
    });

    it('should add wallet to blocklist', async () => {
      // TODO: Implement test
    });

    it('should remove wallet from allowlist', async () => {
      // TODO: Implement test
    });

    it('should remove wallet from blocklist', async () => {
      // TODO: Implement test
    });

    it('should add multiple wallets', async () => {
      // TODO: Implement test
    });

    it('should remove multiple wallets', async () => {
      // TODO: Implement test
    });
  });

  describe('Extra Metas', () => {
    it('should set ABL extra metas on mint', async () => {
      // TODO: Implement test
    });

    it('should validate extra metas account data', async () => {
      // TODO: Implement test
    });
  });

  describe('Integration with Templates', () => {
    it('should verify template-created lists', async () => {
      // TODO: Implement test
    });

    it('should modify template-created lists', async () => {
      // TODO: Implement test
    });
  });
});
