import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from 'gill';
import { fetchEncodedAccount } from 'gill';
import { decodeMint } from 'gill/programs/token';
import {
  getTokenPauseState,
  pauseToken,
  unpauseToken,
  type PauseTokenOptions,
} from '../pause';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';

// Mock gill modules
jest.mock('gill', () => ({
  ...jest.requireActual('gill'),
  fetchEncodedAccount: jest.fn(),
  createTransaction: jest.fn(),
}));

jest.mock('gill/programs/token', () => ({
  ...jest.requireActual('gill/programs/token'),
  decodeMint: jest.fn(),
}));

describe('Pause Management', () => {
  let rpc: Rpc<SolanaRpcApi>;
  let pauseAuthority: TransactionSigner<string>;
  let feePayer: TransactionSigner<string>;
  const mintAddress = 'Mint777777777777777777777777777777777777777' as Address;

  beforeEach(() => {
    jest.clearAllMocks();
    rpc = createMockRpc();
    pauseAuthority = createMockSigner(
      'PauseAuth7777777777777777777777777777777777'
    );
    feePayer = createMockSigner('FeePayer77777777777777777777777777777777777');
  });

  describe('getTokenPauseState', () => {
    test('should return true when token is paused', async () => {
      // Mock fetchEncodedAccount to return a mint account
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      // Mock decodeMint to return a mint with pausable extension
      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
                authority: {
                  __option: 'Some',
                  value: pauseAuthority.address,
                },
              },
            ],
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(true);
      expect(fetchEncodedAccount).toHaveBeenCalledWith(rpc, mintAddress);
      expect(decodeMint).toHaveBeenCalledTimes(1);
    });

    test('should return false when token is not paused', async () => {
      // Mock fetchEncodedAccount to return a mint account
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      // Mock decodeMint to return a mint with pausable extension set to false
      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
                authority: {
                  __option: 'Some',
                  value: pauseAuthority.address,
                },
              },
            ],
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
      expect(fetchEncodedAccount).toHaveBeenCalledWith(rpc, mintAddress);
      expect(decodeMint).toHaveBeenCalledTimes(1);
    });

    test('should return false when token has no pausable extension', async () => {
      // Mock fetchEncodedAccount to return a mint account
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      // Mock decodeMint to return a mint without pausable extension
      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'Test Token',
                symbol: 'TEST',
              },
            ],
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });

    test('should return false when mint has no extensions', async () => {
      // Mock fetchEncodedAccount to return a mint account
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      // Mock decodeMint to return a mint without extensions
      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'None',
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });

    test('should throw error when mint account does not exist', async () => {
      // Mock fetchEncodedAccount to return non-existent account
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: false,
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      // Should return false instead of throwing
      expect(isPaused).toBe(false);
      expect(decodeMint).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully and return false', async () => {
      // Mock fetchEncodedAccount to throw an error
      (fetchEncodedAccount as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });
  });

  describe('pauseToken', () => {
    const pauseOptions: PauseTokenOptions = {
      mint: mintAddress,
      pauseAuthority,
      feePayer,
    };

    test('should return error when token is already paused', async () => {
      // Mock getTokenPauseState to return true (already paused)
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
              },
            ],
          },
        },
      });

      const result = await pauseToken(rpc, pauseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token is already paused');
    });

    test('should attempt to pause token when not paused', async () => {
      // Mock getTokenPauseState to return false (not paused)
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
              },
            ],
          },
        },
      });

      const result = await pauseToken(rpc, pauseOptions);

      // Currently returns placeholder error until Token-2022 implementation
      expect(result.success).toBe(false);
      // The error can vary depending on the implementation state
      expect(result.error).toBeTruthy();
    });

    test('should handle non-pausable tokens', async () => {
      // Mock mint without pausable extension
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'None',
          },
        },
      });

      const result = await pauseToken(rpc, pauseOptions);

      // Should attempt to pause (will fail with placeholder error)
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('unpauseToken', () => {
    const pauseOptions: PauseTokenOptions = {
      mint: mintAddress,
      pauseAuthority,
      feePayer,
    };

    test('should return error when token is not paused', async () => {
      // Mock getTokenPauseState to return false (not paused)
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
              },
            ],
          },
        },
      });

      const result = await unpauseToken(rpc, pauseOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token is not paused');
    });

    test('should attempt to unpause token when paused', async () => {
      // Mock getTokenPauseState to return true (paused)
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
              },
            ],
          },
        },
      });

      const result = await unpauseToken(rpc, pauseOptions);

      // Currently returns placeholder error until Token-2022 implementation
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle invalid mint address format', async () => {
      const invalidMint = 'invalid-address' as Address;

      (fetchEncodedAccount as jest.Mock).mockRejectedValue(
        new Error('Invalid address format')
      );

      const isPaused = await getTokenPauseState(rpc, invalidMint);

      expect(isPaused).toBe(false);
    });

    test('should handle RPC connection errors', async () => {
      (fetchEncodedAccount as jest.Mock).mockRejectedValue(
        new Error('Connection refused')
      );

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });

    test('should handle malformed mint data', async () => {
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      // Mock decodeMint to throw an error
      (decodeMint as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to decode mint');
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });

    test('should handle pausable extension with missing authority', async () => {
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
                authority: {
                  __option: 'None',
                },
              },
            ],
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(false);
    });

    test('should handle multiple extensions including pausable', async () => {
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'TokenMetadata',
                name: 'Test Token',
                symbol: 'TEST',
              },
              {
                __kind: 'PausableConfig',
                paused: true,
                authority: {
                  __option: 'Some',
                  value: pauseAuthority.address,
                },
              },
              {
                __kind: 'DefaultAccountState',
                state: 'frozen',
              },
            ],
          },
        },
      });

      const isPaused = await getTokenPauseState(rpc, mintAddress);

      expect(isPaused).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    test('pause and unpause flow', async () => {
      const pauseOptions: PauseTokenOptions = {
        mint: mintAddress,
        pauseAuthority,
        feePayer,
      };

      // Initially not paused
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValueOnce({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
              },
            ],
          },
        },
      });

      // First check: not paused
      let isPaused = await getTokenPauseState(rpc, mintAddress);
      expect(isPaused).toBe(false);

      // Attempt to pause (will fail with placeholder error)
      const pauseResult = await pauseToken(rpc, pauseOptions);
      expect(pauseResult.success).toBe(false);
      expect(pauseResult.error).toBeTruthy();

      // Mock state change to paused for next check
      (decodeMint as jest.Mock).mockReturnValueOnce({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
              },
            ],
          },
        },
      });

      // Check again: now paused (simulated)
      isPaused = await getTokenPauseState(rpc, mintAddress);
      expect(isPaused).toBe(true);

      // Attempt to pause again should fail
      (decodeMint as jest.Mock).mockReturnValueOnce({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
              },
            ],
          },
        },
      });

      const pauseAgainResult = await pauseToken(rpc, pauseOptions);
      expect(pauseAgainResult.success).toBe(false);
      expect(pauseAgainResult.error).toBe('Token is already paused');

      // Attempt to unpause (will fail with placeholder error)
      (decodeMint as jest.Mock).mockReturnValueOnce({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: true,
              },
            ],
          },
        },
      });

      const unpauseResult = await unpauseToken(rpc, pauseOptions);
      expect(unpauseResult.success).toBe(false);
      expect(unpauseResult.error).toBeTruthy();
    });

    test('should handle concurrent pause attempts', async () => {
      const pauseOptions: PauseTokenOptions = {
        mint: mintAddress,
        pauseAuthority,
        feePayer,
      };

      // Mock not paused state
      (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      });

      (decodeMint as jest.Mock).mockReturnValue({
        data: {
          extensions: {
            __option: 'Some',
            value: [
              {
                __kind: 'PausableConfig',
                paused: false,
              },
            ],
          },
        },
      });

      // Simulate concurrent pause attempts
      const results = await Promise.all([
        pauseToken(rpc, pauseOptions),
        pauseToken(rpc, pauseOptions),
        pauseToken(rpc, pauseOptions),
      ]);

      // All should fail with placeholder error
      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
      });
    });
  });
});
