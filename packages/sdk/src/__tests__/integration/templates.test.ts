import setupTestSuite from './setup';
import type { Client } from './setup';
import type { TransactionSigner } from 'gill';
import { describeSkipIf } from './helpers';

// skipping abl, management, templates, token-acl until #43 merges

describeSkipIf()('Templates Integration Tests', () => {
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

  describe('Stablecoin Template', () => {
    describe('Single-signer flow (feePayer = mintAuthority)', () => {
      it('should create mint with correct extensions (metadata, pausable, confidential balances, permanent delegate, default state frozen)', async () => {
        // TODO: Implement test
      });

      it('should create Token ACL config and set ABL as gating program', async () => {
        // TODO: Implement test
      });

      it('should create blocklist by default', async () => {
        // TODO: Implement test
      });

      it('should set ABL extra metas on mint', async () => {
        // TODO: Implement test
      });

      it('should enable permissionless thaw', async () => {
        // TODO: Implement test
      });
    });

    describe('Multi-signer flow (feePayer ≠ mintAuthority)', () => {
      it('should create mint with extensions only (no ACL setup)', async () => {
        // TODO: Implement test
      });
    });

    describe('Allowlist mode option', () => {
      it('should create allowlist instead of blocklist when specified', async () => {
        // TODO: Implement test
      });
    });
  });

  describe('Arcade Token Template', () => {
    describe('Single-signer flow', () => {
      it('should create mint with correct extensions (metadata, pausable, permanent delegate, default state frozen)', async () => {
        // TODO: Implement test
      });

      it('should set up Token ACL with allowlist', async () => {
        // TODO: Implement test
      });

      it('should enable permissionless thaw', async () => {
        // TODO: Implement test
      });
    });

    describe('Multi-signer flow', () => {
      it('should create mint without ACL setup', async () => {
        // TODO: Implement test
      });
    });
  });

  describe('Tokenized Security Template', () => {
    describe('Single-signer flow', () => {
      it('should create mint with all stablecoin extensions + Scaled UI Amount', async () => {
        // TODO: Implement test
      });

      it('should set up Token ACL with specified mode (blocklist default)', async () => {
        // TODO: Implement test
      });

      it('should validate scaled UI amount configuration', async () => {
        // TODO: Implement test
      });
    });

    describe('Multi-signer flow', () => {
      it('should create mint with extensions only', async () => {
        // TODO: Implement test
      });
    });
  });

  describe('Template Authority Options', () => {
    it('should accept custom freeze authority', async () => {
      // TODO: Implement test
    });

    it('should accept custom permanent delegate', async () => {
      // TODO: Implement test
    });

    it('should accept custom metadata authority', async () => {
      // TODO: Implement test
    });
  });
});
