import { Address, Rpc, SolanaRpcApiMainnet, TransactionSigner } from '@solana/kit';

/**
 * Creates a mock RPC client for testing
 */
export function createMockRpc(): any {
  return {
    getMinimumBalanceForRentExemption: (space: bigint) => ({
      send: () => Promise.resolve(2039280n),
    }),
    getLatestBlockhash: () => ({
      send: () => Promise.resolve({
        value: {
          blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
          lastValidBlockHeight: 12345678,
        },
      }),
    }),
  };
}

/**
 * Creates a mock transaction signer for testing
 */
export function createMockSigner(address?: string): TransactionSigner<string> {
  const mockAddress = address || 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj'; // Valid SOL mint address
  return {
    address: mockAddress as Address,
    sign: () => Promise.resolve(new Uint8Array(64)),
  } as any;
}

/**
 * Generates a mock Solana address for testing
 */
export function generateMockAddress(): string {
  return 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v'; // Valid base58 address
}

/**
 * Creates a Map with test metadata
 */
export function createTestAdditionalMetadata(): Map<string, string> {
  const metadata = new Map<string, string>();
  metadata.set('description', 'Test token description');
  metadata.set('website', 'https://example.com');
  return metadata;
}

/**
 * Test metadata object
 */
export const TEST_METADATA = {
  name: 'Test Token',
  symbol: 'TEST',
  uri: 'https://example.com/metadata.json',
};

/**
 * Mock authority address
 */
export const TEST_AUTHORITY = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address; 