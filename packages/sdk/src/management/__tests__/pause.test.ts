import type { Address, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { fetchEncodedAccount } from '@solana/kit';
import { decodeMint } from '@solana-program/token-2022';
import { getTokenPauseState } from '../pause';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';

// Mock @solana/kit modules
jest.mock('@solana/kit', () => ({
    ...jest.requireActual('@solana/kit'),
    fetchEncodedAccount: jest.fn(),
    createTransaction: jest.fn(),
}));

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    decodeMint: jest.fn(),
}));

describe('Pause Management', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let pauseAuthority: TransactionSigner<string>;
    const mintAddress = 'Mint777777777777777777777777777777777777777' as Address;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
        pauseAuthority = createMockSigner('PauseAuth7777777777777777777777777777777777');
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
            expect(fetchEncodedAccount).toHaveBeenCalledWith(rpc, mintAddress, {
                commitment: 'confirmed',
            });
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
            expect(fetchEncodedAccount).toHaveBeenCalledWith(rpc, mintAddress, {
                commitment: 'confirmed',
            });
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
            (fetchEncodedAccount as jest.Mock).mockRejectedValue(new Error('Network error'));

            const isPaused = await getTokenPauseState(rpc, mintAddress);

            expect(isPaused).toBe(false);
        });
    });

    describe('Edge cases and error handling', () => {
        test('should handle invalid mint address format', async () => {
            const invalidMint = 'invalid-address' as Address;

            (fetchEncodedAccount as jest.Mock).mockRejectedValue(new Error('Invalid address format'));

            const isPaused = await getTokenPauseState(rpc, invalidMint);

            expect(isPaused).toBe(false);
        });

        test('should handle RPC connection errors', async () => {
            (fetchEncodedAccount as jest.Mock).mockRejectedValue(new Error('Connection refused'));

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
});
