import { address, type Address } from 'gill';
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import {
  inspectToken,
  getTokenMetadata,
  getTokenExtensionsDetailed,
  detectTokenTypeFromMint,
  inspectionResultToDashboardData,
  getTokenDashboardData,
} from '../inspectToken';
import type { TokenInspectionResult } from '../types';

// Mock gill modules
jest.mock('gill', () => ({
  ...jest.requireActual('gill'),
  fetchEncodedAccount: jest.fn(),
  getProgramDerivedAddress: jest.fn(),
  getAddressEncoder: jest.fn(() => ({
    encode: (addr: Address) => Buffer.from(addr as string),
  })),
}));

jest.mock('gill/programs/token', () => ({
  ...jest.requireActual('gill/programs/token'),
  decodeMint: jest.fn(),
}));

import { fetchEncodedAccount, getProgramDerivedAddress } from 'gill';
import { decodeMint } from 'gill/programs/token';
const mockMintAddress = address('AqQw6rR2Qw2LRp5MNDoAuCEiBzKBdZx2drF6DCJx4w5H');
const mockAuthority = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

describe('inspectToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token-2022 tokens', () => {
    it('should correctly parse a stablecoin with all extensions', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 1000000n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'Some', value: mockAuthority },
          freezeAuthority: { __option: 'Some', value: mockAuthority },
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'USD Coin',
                symbol: 'USDC',
                uri: 'https://example.com/metadata.json',
                updateAuthority: { __option: 'Some', value: mockAuthority },
                additionalMetadata: new Map(),
              },
              {
                __kind: 'PermanentDelegate',
                delegate: mockAuthority,
              },
              {
                __kind: 'DefaultAccountState',
                state: 'Initialized',
              },
              {
                __kind: 'ConfidentialTransferMint',
                authority: { __option: 'Some', value: mockAuthority },
                autoApproveNewAccounts: true,
              },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const result = await inspectToken({} as any, mockMintAddress);

      expect(result.address).toEqual(mockMintAddress);
      expect(result.programId).toEqual(TOKEN_2022_PROGRAM_ADDRESS);
      expect(result.supplyInfo.supply).toEqual(1000000n);
      expect(result.supplyInfo.decimals).toEqual(6);
      expect(result.metadata?.name).toEqual('USD Coin');
      expect(result.metadata?.symbol).toEqual('USDC');
      expect(result.detectedType).toEqual('stablecoin');
      expect(result.isPausable).toBe(true);
      expect(result.isToken2022).toBe(true);
      expect(result.aclMode).toEqual('blocklist');
      expect(result.extensions).toHaveLength(5); // 4 extensions + Pausable
    });

    it('should correctly parse an arcade token', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 5000000n,
          decimals: 9,
          isInitialized: true,
          mintAuthority: { __option: 'Some', value: mockAuthority },
          freezeAuthority: { __option: 'Some', value: mockAuthority },
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'Game Token',
                symbol: 'GAME',
                uri: 'https://example.com/game.json',
                updateAuthority: { __option: 'Some', value: mockAuthority },
              },
              {
                __kind: 'PermanentDelegate',
                delegate: mockAuthority,
              },
              {
                __kind: 'DefaultAccountState',
                state: 'Frozen',
              },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const result = await inspectToken({} as any, mockMintAddress);

      expect(result.metadata?.name).toEqual('Game Token');
      expect(result.metadata?.symbol).toEqual('GAME');
      expect(result.detectedType).toEqual('arcade-token');
      expect(result.aclMode).toEqual('allowlist');
      expect(result.extensions.map(e => e.name)).toContain(
        'DefaultAccountState'
      );
    });

    it('should handle tokens without extensions', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: { __option: 'None' },
          extensions: { __option: 'None' },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const result = await inspectToken({} as any, mockMintAddress);

      expect(result.extensions).toHaveLength(0);
      expect(result.detectedType).toEqual('unknown');
      expect(result.isPausable).toBe(false);
      expect(result.aclMode).toEqual('none');
    });
  });

  describe('Legacy SPL tokens', () => {
    it('should fetch Metaplex metadata for legacy tokens', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 1000000n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'Some', value: mockAuthority },
          freezeAuthority: { __option: 'None' },
        },
      };

      // Mock Metaplex metadata account
      const mockMetadataAccount = {
        exists: true,
        data: createMockMetaplexMetadata(
          'Legacy Token',
          'LEGACY',
          'https://example.com'
        ),
      };

      (fetchEncodedAccount as jest.Mock)
        .mockResolvedValueOnce(mockEncodedAccount) // First call for mint
        .mockResolvedValueOnce(mockMetadataAccount); // Second call for metadata

      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);
      (getProgramDerivedAddress as jest.Mock).mockResolvedValue([
        address('MetaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
      ]);

      const result = await inspectToken({} as any, mockMintAddress);

      expect(result.isToken2022).toBe(false);
      expect(result.metadata?.name).toEqual('Legacy Token');
      expect(result.metadata?.symbol).toEqual('LEGACY');
      expect(result.extensions.map(e => e.name)).toContain('MetaplexMetadata');
    });

    it('should handle legacy tokens without metadata', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 500000n,
          decimals: 9,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: { __option: 'None' },
        },
      };

      (fetchEncodedAccount as jest.Mock)
        .mockResolvedValueOnce(mockEncodedAccount) // Mint account
        .mockResolvedValueOnce({ exists: false }); // No metadata account

      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);
      (getProgramDerivedAddress as jest.Mock).mockResolvedValue([
        address('MetaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
      ]);

      const result = await inspectToken({} as any, mockMintAddress);

      expect(result.isToken2022).toBe(false);
      expect(result.metadata).toBeUndefined();
      expect(result.extensions).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should throw error if mint account does not exist', async () => {
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({ exists: false });

      await expect(inspectToken({} as any, mockMintAddress)).rejects.toThrow(
        'Mint account not found'
      );
    });

    it('should throw error if account is not a valid mint', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: address('11111111111111111111111111111111'),
        data: new Uint8Array(100),
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);

      await expect(inspectToken({} as any, mockMintAddress)).rejects.toThrow(
        'Invalid mint account'
      );
    });
  });
});

describe('Helper functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTokenMetadata', () => {
    it('should return only metadata from inspection result', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: { __option: 'None' },
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'Test Token',
                symbol: 'TEST',
                uri: 'https://test.com',
                updateAuthority: { __option: 'None' },
              },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const metadata = await getTokenMetadata({} as any, mockMintAddress);

      expect(metadata).toEqual({
        name: 'Test Token',
        symbol: 'TEST',
        uri: 'https://test.com',
        updateAuthority: null,
      });
    });

    it('should return null if no metadata exists', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: { __option: 'None' },
          extensions: { __option: 'None' },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const metadata = await getTokenMetadata({} as any, mockMintAddress);

      expect(metadata).toBeNull();
    });
  });

  describe('getTokenExtensionsDetailed', () => {
    it('should return detailed extension information', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: {
            __option: 'Some',
            value: mockAuthority,
          },
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'DefaultAccountState',
                state: 'Frozen',
              },
              {
                __kind: 'PermanentDelegate',
                delegate: mockAuthority,
              },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const extensions = await getTokenExtensionsDetailed(
        {} as any,
        mockMintAddress
      );

      expect(extensions).toHaveLength(3); // 2 extensions + Pausable
      expect(extensions[0].name).toEqual('DefaultAccountState');
      expect(extensions[0].details?.state).toEqual('Frozen');
      expect(extensions[1].name).toEqual('PermanentDelegate');
      expect(extensions[2].name).toEqual('Pausable');
    });
  });

  describe('detectTokenTypeFromMint', () => {
    it('should correctly identify token type', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: { __option: 'None' },
          freezeAuthority: {
            __option: 'Some',
            value: mockAuthority,
          },
          extensions: {
            __option: 'Some',
            value: [
              { __kind: 'TokenMetadata' },
              { __kind: 'PermanentDelegate' },
              { __kind: 'DefaultAccountState' },
              { __kind: 'ConfidentialTransferMint' },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const type = await detectTokenTypeFromMint({} as any, mockMintAddress);

      expect(type).toEqual('stablecoin');
    });
  });

  describe('inspectionResultToDashboardData', () => {
    it('should convert inspection result to dashboard format', () => {
      const mockInspection: TokenInspectionResult = {
        address: mockMintAddress,
        programId: TOKEN_2022_PROGRAM_ADDRESS,
        supplyInfo: {
          supply: 1000000n,
          decimals: 6,
          isInitialized: true,
        },
        metadata: {
          name: 'Test Token',
          symbol: 'TEST',
          uri: 'https://test.com',
        },
        authorities: {
          mintAuthority: mockAuthority,
          freezeAuthority: mockAuthority,
        },
        extensions: [{ name: 'TokenMetadata' }, { name: 'PermanentDelegate' }],
        detectedType: 'arcade-token',
        isPausable: true,
        isToken2022: true,
        aclMode: 'allowlist',
        enableSrfc37: false,
      };

      const dashboardData = inspectionResultToDashboardData(mockInspection);

      expect(dashboardData.name).toEqual('Test Token');
      expect(dashboardData.symbol).toEqual('TEST');
      expect(dashboardData.address).toEqual(mockMintAddress.toString());
      expect(dashboardData.decimals).toEqual(6);
      expect(dashboardData.supply).toEqual('1000000');
      expect(dashboardData.type).toEqual('arcade-token');
      expect(dashboardData.aclMode).toEqual('allowlist');
      expect(dashboardData.extensions).toEqual([
        'TokenMetadata',
        'PermanentDelegate',
      ]);
    });
  });

  describe('getTokenDashboardData', () => {
    it('should return complete dashboard data in one call', async () => {
      const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
      };

      const mockDecodedMint = {
        data: {
          supply: 1000000n,
          decimals: 6,
          isInitialized: true,
          mintAuthority: {
            __option: 'Some',
            value: mockAuthority,
          },
          freezeAuthority: { __option: 'None' },
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'Dashboard Token',
                symbol: 'DASH',
                uri: 'https://dashboard.com',
                updateAuthority: { __option: 'None' },
              },
            ],
          },
        },
      };

      (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
      (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

      const dashboardData = await getTokenDashboardData(
        {} as any,
        mockMintAddress
      );

      expect(dashboardData.name).toEqual('Dashboard Token');
      expect(dashboardData.symbol).toEqual('DASH');
      expect(dashboardData.mintAuthority).toEqual(mockAuthority.toString());
      expect(dashboardData.freezeAuthority).toBeUndefined();
    });
  });
});

// Helper function to create mock Metaplex metadata bytes
function createMockMetaplexMetadata(
  name: string,
  symbol: string,
  uri: string
): Uint8Array {
  const data = new Uint8Array(500);
  let offset = 1; // Skip discriminator

  // Skip update authority (32 bytes)
  offset += 32;
  // Skip mint (32 bytes)
  offset += 32;

  // Name length (4 bytes) and content (32 bytes padded)
  const nameBytes = Buffer.from(name, 'utf-8');
  data[offset] = nameBytes.length;
  offset += 4;
  data.set(nameBytes, offset);
  offset += 32;

  // Symbol length (4 bytes) and content (10 bytes padded)
  const symbolBytes = Buffer.from(symbol, 'utf-8');
  data[offset] = symbolBytes.length;
  offset += 4;
  data.set(symbolBytes, offset);
  offset += 10;

  // URI length (4 bytes) and content (200 bytes padded)
  const uriBytes = Buffer.from(uri, 'utf-8');
  data[offset] = uriBytes.length;
  offset += 4;
  data.set(uriBytes, offset);

  return data;
}
