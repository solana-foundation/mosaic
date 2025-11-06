import setupTestSuite from './setup';
import type { Client } from './setup';
import type { TransactionSigner } from 'gill';
import { describeSkipIf } from './helpers';

// skipping abl, management, templates, token-acl until #43 merges

describeSkipIf()('Token ACL Integration Tests', () => {
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

  describe('Configuration', () => {
    it('should create Token ACL config for mint', async () => {
      // TODO: Implement test
    });

    it('should set ABL as gating program', async () => {
      // TODO: Implement test
    });

    it('should update gating program', async () => {
      // TODO: Implement test
    });
  });

  describe('Permissionless Thaw', () => {
    it('should enable permissionless thaw', async () => {
      // TODO: Implement test
    });

    it('should thaw frozen account (allowlist validation)', async () => {
      // TODO: Implement test
    });

    it('should thaw frozen account (blocklist validation)', async () => {
      // TODO: Implement test
    });

    it('should fail thaw when wallet not on allowlist', async () => {
      // TODO: Implement test
    });

    it('should fail thaw when wallet on blocklist', async () => {
      // TODO: Implement test
    });
  });

  describe('Authority-Driven Operations', () => {
    it('should freeze account with freeze authority', async () => {
      // TODO: Implement test
    });

    it('should thaw account with freeze authority', async () => {
      // TODO: Implement test
    });

    it('should handle freeze/thaw cycle', async () => {
      // TODO: Implement test
    });
  });
});
