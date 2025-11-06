import setupTestSuite from './setup';
import type { Client } from './setup';
import type { TransactionSigner } from 'gill';
import { describeSkipIf } from './helpers';

describeSkipIf()('Inspection Integration Tests', () => {
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

  describe('Metadata Inspection', () => {
    it('should get token metadata (name, symbol, URI)', async () => {
      // TODO: Implement test
    });

    it('should get token extensions detailed', async () => {
      // TODO: Implement test
    });

    it('should detect token type as stablecoin', async () => {
      // TODO: Implement test
    });

    it('should detect token type as arcade', async () => {
      // TODO: Implement test
    });

    it('should detect token type as security', async () => {
      // TODO: Implement test
    });

    it('should detect token type as unknown', async () => {
      // TODO: Implement test
    });
  });

  describe('Authority Inspection', () => {
    it('should get mint authority', async () => {
      // TODO: Implement test
    });

    it('should get freeze authority', async () => {
      // TODO: Implement test
    });

    it('should get metadata authority', async () => {
      // TODO: Implement test
    });

    it('should get permanent delegate', async () => {
      // TODO: Implement test
    });
  });

  describe('Supply and State', () => {
    it('should get total supply', async () => {
      // TODO: Implement test
    });

    it('should get token account balances', async () => {
      // TODO: Implement test
    });

    it('should get frozen state', async () => {
      // TODO: Implement test
    });
  });

  describe('Dashboard Data', () => {
    it('should convert inspection result to dashboard data', async () => {
      // TODO: Implement test
    });

    it('should get complete token dashboard data', async () => {
      // TODO: Implement test
    });
  });

  describe('ACL Mode Detection', () => {
    it('should detect allowlist mode', async () => {
      // TODO: Implement test
    });

    it('should detect blocklist mode', async () => {
      // TODO: Implement test
    });

    it('should detect no ACL', async () => {
      // TODO: Implement test
    });
  });
});
