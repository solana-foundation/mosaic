import { address, type Address } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
// TOKEN_PROGRAM_ADDRESS is for the original SPL Token program, defined locally for tests
const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
import {
    inspectToken,
    getTokenMetadata,
    getTokenExtensionsDetailed,
    inspectionResultToDashboardData,
    getTokenDashboardData,
    detectTokenPatterns,
} from '../inspect-token.js';
import type { TokenInspectionResult } from '../types.js';

// Mock @solana/kit modules
jest.mock('@solana/kit', () => ({
    ...jest.requireActual('@solana/kit'),
    fetchEncodedAccount: jest.fn(),
    getAddressEncoder: jest.fn(() => ({
        encode: (addr: Address) => Buffer.from(addr as string),
    })),
}));

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    decodeMint: jest.fn(),
}));

import { fetchEncodedAccount } from '@solana/kit';
import { decodeMint } from '@solana-program/token-2022';
import { createMockRpc } from '../../__tests__/test-utils.js';
const mockMintAddress = address('AqQw6rR2Qw2LRp5MNDoAuCEiBzKBdZx2drF6DCJx4w5H');
const mockAuthority = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');
const mockRpc = createMockRpc();

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
                                name: 'USD Stablecoin',
                                symbol: 'USDS',
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
                                auditorElgamalPubkey: { __option: 'Some', value: mockAuthority },
                            },
                            {
                                __kind: 'PausableConfig',
                                authority: { __option: 'Some', value: mockAuthority },
                                paused: false,
                            },
                        ],
                    },
                },
            };

            (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
            (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

            const result = await inspectToken(mockRpc, mockMintAddress);

            expect(result.address).toEqual(mockMintAddress);
            expect(result.programId).toEqual(TOKEN_2022_PROGRAM_ADDRESS);
            expect(result.supplyInfo.supply).toEqual(1000000n);
            expect(result.supplyInfo.decimals).toEqual(6);
            expect(result.metadata?.name).toEqual('USD Stablecoin');
            expect(result.metadata?.symbol).toEqual('USDS');
            expect(result.detectedPatterns).toEqual(['stablecoin']);
            expect(result.isPausable).toBe(true);
            expect(result.aclMode).toEqual('blocklist');
            expect(result.extensions).toHaveLength(5); // 5 extensions

            const confidentialExt = result.extensions.find(e => e.name === 'ConfidentialTransferMint');
            expect(confidentialExt?.details?.autoApproveNewAccounts).toBe(true);
            expect(confidentialExt?.details?.auditorElgamalPubkey).toEqual(mockAuthority);
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
                            {
                                __kind: 'PausableConfig',
                                authority: { __option: 'Some', value: mockAuthority },
                                paused: false,
                            },
                        ],
                    },
                },
            };

            (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
            (decodeMint as jest.Mock).mockReturnValue(mockDecodedMint);

            const result = await inspectToken(mockRpc, mockMintAddress);

            expect(result.metadata?.name).toEqual('Game Token');
            expect(result.metadata?.symbol).toEqual('GAME');
            expect(result.detectedPatterns).toEqual(['arcade-token']);
            expect(result.aclMode).toEqual('allowlist');
            expect(result.extensions.map(e => e.name)).toContain('DefaultAccountState');
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

            const result = await inspectToken(mockRpc, mockMintAddress);

            expect(result.extensions).toHaveLength(0);
            expect(result.detectedPatterns).toEqual(['unknown']);
            expect(result.isPausable).toBe(false);
            expect(result.aclMode).toEqual('none');
        });
    });

    describe('Error handling', () => {
        it('should throw error if account is not a valid token-2022 mint', async () => {
            const mockEncodedAccount = {
                exists: true,
                programAddress: TOKEN_PROGRAM_ADDRESS,
                data: new Uint8Array(100),
            };

            (fetchEncodedAccount as jest.Mock).mockResolvedValueOnce(mockEncodedAccount);

            await expect(inspectToken(mockRpc, mockMintAddress)).rejects.toThrow('Invalid mint account');
        });

        it('should throw error if mint account does not exist', async () => {
            (fetchEncodedAccount as jest.Mock).mockResolvedValue({ exists: false });

            await expect(inspectToken(mockRpc, mockMintAddress)).rejects.toThrow('Mint account not found');
        });

        it('should throw error if account is not a valid mint', async () => {
            const mockEncodedAccount = {
                exists: true,
                programAddress: address('11111111111111111111111111111111'),
                data: new Uint8Array(100),
            };

            (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);

            await expect(inspectToken(mockRpc, mockMintAddress)).rejects.toThrow('Invalid mint account');
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

            const metadata = await getTokenMetadata(mockRpc, mockMintAddress);

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

            const metadata = await getTokenMetadata(mockRpc, mockMintAddress);

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

            const extensions = await getTokenExtensionsDetailed(mockRpc, mockMintAddress);

            expect(extensions).toHaveLength(2); // 2 extensions
            expect(extensions[0].name).toEqual('DefaultAccountState');
            expect(extensions[0].details?.state).toEqual('Frozen');
            expect(extensions[1].name).toEqual('PermanentDelegate');
        });
    });

    describe('detectTokenPatterns', () => {
        // One case per template in packages/sdk/src/templates/, using the mint
        // extension set each template actually creates. The patterns must be
        // mutually exclusive: exactly one match per template.
        it('identifies the stablecoin template as stablecoin only', () => {
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'PausableConfig' },
                { name: 'DefaultAccountState' },
                { name: 'ConfidentialTransferMint' },
                { name: 'PermanentDelegate' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['stablecoin']);
        });

        it('identifies the arcade token template as arcade-token only', () => {
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'PausableConfig' },
                { name: 'DefaultAccountState' },
                { name: 'PermanentDelegate' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['arcade-token']);
        });

        it('identifies the tokenized security template as tokenized-security only', () => {
            // The tokenized-security template produces the full stablecoin set
            // plus PermissionedBurn and ScaledUiAmountConfig — it must NOT also
            // report as a stablecoin or arcade token.
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'PausableConfig' },
                { name: 'DefaultAccountState' },
                { name: 'ConfidentialTransferMint' },
                { name: 'PermanentDelegate' },
                { name: 'PermissionedBurn' },
                { name: 'ScaledUiAmountConfig' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['tokenized-security']);
        });

        it('identifies a minimal security-shaped set as tokenized-security only', () => {
            const extensions = [
                { name: 'TokenMetadata' },
                { name: 'PermanentDelegate' },
                { name: 'DefaultAccountState' },
                { name: 'PausableConfig' },
                { name: 'ScaledUiAmountConfig' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['tokenized-security']);
        });

        it('identifies the mmf template as mmf only', () => {
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'PausableConfig' },
                { name: 'DefaultAccountState' },
                { name: 'PermanentDelegate' },
                { name: 'TransferHook' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['mmf']);
        });

        it('identifies the mmf template with confidential balances as mmf only', () => {
            // With enableConfidential the mmf set becomes a superset of the
            // stablecoin set — it must still report only as mmf.
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'PausableConfig' },
                { name: 'DefaultAccountState' },
                { name: 'PermanentDelegate' },
                { name: 'TransferHook' },
                { name: 'ConfidentialTransferMint' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['mmf']);
        });

        it('reports a custom token that matches no template as unknown', () => {
            // The custom-token template allows arbitrary extension combinations;
            // one that fits no predefined shape must fall through to 'unknown'.
            const extensions = [
                { name: 'MetadataPointer' },
                { name: 'TokenMetadata' },
                { name: 'TransferFeeConfig' },
                { name: 'NonTransferable' },
            ];

            expect(detectTokenPatterns(extensions)).toEqual(['unknown']);
        });
    });

    describe('inspectionResultToDashboardData', () => {
        it('should convert inspection result to dashboard format', () => {
            const mockInspection: TokenInspectionResult = {
                address: mockMintAddress,
                programId: TOKEN_2022_PROGRAM_ADDRESS,
                isToken2022: true,
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
                detectedPatterns: ['arcade-token'],
                isPausable: false,
                aclMode: 'allowlist',
                enableSrfc37: false,
            };

            const dashboardData = inspectionResultToDashboardData(mockInspection);

            expect(dashboardData.name).toEqual('Test Token');
            expect(dashboardData.symbol).toEqual('TEST');
            expect(dashboardData.address).toEqual(mockMintAddress.toString());
            expect(dashboardData.decimals).toEqual(6);
            expect(dashboardData.supply).toEqual('1000000');
            expect(dashboardData.detectedPatterns).toEqual(['arcade-token']);
            expect(dashboardData.aclMode).toEqual('allowlist');
            expect(dashboardData.extensions).toEqual(['TokenMetadata', 'PermanentDelegate']);
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

            const dashboardData = await getTokenDashboardData(mockRpc, mockMintAddress);

            expect(dashboardData.name).toEqual('Dashboard Token');
            expect(dashboardData.symbol).toEqual('DASH');
            expect(dashboardData.mintAuthority).toEqual(mockAuthority.toString());
            expect(dashboardData.freezeAuthority).toBeUndefined();
        });
    });
});

describe('rate-bearing extensions', () => {
    const mockEncodedAccount = {
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: new Uint8Array(100),
    };

    const mockMintWith = (extension: Record<string, unknown>) => ({
        data: {
            supply: 0n,
            decimals: 6,
            isInitialized: true,
            mintAuthority: { __option: 'Some', value: mockAuthority },
            freezeAuthority: { __option: 'None' },
            extensions: { __option: 'Some', value: [extension] },
        },
    });

    // An unset OptionalNonZeroPubkey decodes as the all-zero key
    const zeroAddress = '11111111111111111111111111111111' as Address;
    const olderTransferFee = { epoch: 3n, transferFeeBasisPoints: 100, maximumFee: 10n };
    const newerTransferFee = { epoch: 5n, transferFeeBasisPoints: 250, maximumFee: 1_000_000n };

    const mockCurrentEpoch = (epoch: bigint) => {
        (mockRpc as unknown as { getEpochInfo: jest.Mock }).getEpochInfo = jest.fn(() => ({
            send: () => Promise.resolve({ epoch }),
        }));
    };

    const mockTransferFeeMint = (authorities: { fee: Address; withdraw: Address }) =>
        mockMintWith({
            __kind: 'TransferFeeConfig',
            transferFeeConfigAuthority: authorities.fee,
            withdrawWithheldAuthority: authorities.withdraw,
            withheldAmount: 42n,
            olderTransferFee,
            newerTransferFee,
        });

    beforeEach(() => {
        jest.clearAllMocks();
        (fetchEncodedAccount as jest.Mock).mockResolvedValue(mockEncodedAccount);
        mockCurrentEpoch(6n);
    });

    it('decodes TransferFeeConfig with the newer fee active once its epoch is reached', async () => {
        (decodeMint as jest.Mock).mockReturnValue(
            mockTransferFeeMint({ fee: mockAuthority, withdraw: mockMintAddress }),
        );

        const result = await inspectToken(mockRpc, mockMintAddress);

        const ext = result.extensions.find(e => e.name === 'TransferFeeConfig');
        expect(ext?.details).toEqual({
            authority: mockAuthority,
            withdrawAuthority: mockMintAddress,
            transferFeeBasisPoints: 250,
            maximumFee: 1_000_000n,
            currentEpoch: 6n,
            newerTransferFee,
            olderTransferFee,
            withheldAmount: 42n,
        });
        expect(result.transferFee).toEqual({
            transferFeeBasisPoints: 250,
            maximumFee: 1_000_000n,
            currentEpoch: 6n,
            newerTransferFee,
            olderTransferFee,
            withheldAmount: 42n,
            authority: mockAuthority,
            withdrawAuthority: mockMintAddress,
        });
        expect(result.interestBearing).toBeUndefined();
    });

    it('keeps the older fee active while the newer one is pending', async () => {
        mockCurrentEpoch(4n);
        (decodeMint as jest.Mock).mockReturnValue(
            mockTransferFeeMint({ fee: mockAuthority, withdraw: mockMintAddress }),
        );

        const result = await inspectToken(mockRpc, mockMintAddress);

        expect(result.transferFee?.transferFeeBasisPoints).toBe(100);
        expect(result.transferFee?.maximumFee).toBe(10n);
        expect(result.transferFee?.newerTransferFee).toEqual(newerTransferFee);
        const ext = result.extensions.find(e => e.name === 'TransferFeeConfig');
        expect(ext?.details?.transferFeeBasisPoints).toBe(100);
        expect(ext?.details?.maximumFee).toBe(10n);
        expect(inspectionResultToDashboardData(result).transferFeeBasisPoints).toBe(100);
    });

    it('reports revoked transfer fee authorities as null', async () => {
        (decodeMint as jest.Mock).mockReturnValue(mockTransferFeeMint({ fee: zeroAddress, withdraw: zeroAddress }));

        const result = await inspectToken(mockRpc, mockMintAddress);

        expect(result.transferFee?.authority).toBeNull();
        expect(result.transferFee?.withdrawAuthority).toBeNull();
        const ext = result.extensions.find(e => e.name === 'TransferFeeConfig');
        expect(ext?.details).not.toHaveProperty('authority');
        expect(ext?.details).not.toHaveProperty('withdrawAuthority');
    });

    it('reports revoked rate and scaled UI authorities as null', async () => {
        (decodeMint as jest.Mock).mockReturnValue(
            mockMintWith({
                __kind: 'InterestBearingConfig',
                rateAuthority: zeroAddress,
                initializationTimestamp: 1790000000n,
                preUpdateAverageRate: 400,
                lastUpdateTimestamp: 1790050000n,
                currentRate: 500,
            }),
        );
        expect((await inspectToken(mockRpc, mockMintAddress)).interestBearing?.rateAuthority).toBeNull();

        (decodeMint as jest.Mock).mockReturnValue(
            mockMintWith({
                __kind: 'ScaledUiAmountConfig',
                authority: zeroAddress,
                multiplier: 1,
                newMultiplier: 1,
                newMultiplierEffectiveTimestamp: 0n,
            }),
        );
        expect((await inspectToken(mockRpc, mockMintAddress)).scaledUiAmount?.authority).toBeNull();
    });

    it('decodes InterestBearingConfig into explicit fields', async () => {
        (decodeMint as jest.Mock).mockReturnValue(
            mockMintWith({
                __kind: 'InterestBearingConfig',
                rateAuthority: mockAuthority,
                initializationTimestamp: 1790000000n,
                preUpdateAverageRate: 400,
                lastUpdateTimestamp: 1790050000n,
                currentRate: 500,
            }),
        );

        const result = await inspectToken(mockRpc, mockMintAddress);

        const ext = result.extensions.find(e => e.name === 'InterestBearingConfig');
        expect(ext?.details).toEqual({
            rateAuthority: mockAuthority,
            currentRate: 500,
            preUpdateAverageRate: 400,
            initializationTimestamp: 1790000000n,
            lastUpdateTimestamp: 1790050000n,
        });
        expect(ext?.details).not.toHaveProperty('__kind');
        expect(result.interestBearing).toEqual({
            currentRate: 500,
            preUpdateAverageRate: 400,
            initializationTimestamp: 1790000000n,
            lastUpdateTimestamp: 1790050000n,
            rateAuthority: mockAuthority,
        });
        expect(result.transferFee).toBeUndefined();
    });

    it('decodes the ScaledUiAmountConfig schedule', async () => {
        (decodeMint as jest.Mock).mockReturnValue(
            mockMintWith({
                __kind: 'ScaledUiAmountConfig',
                authority: mockAuthority,
                multiplier: 2,
                newMultiplier: 5,
                newMultiplierEffectiveTimestamp: 1790072001n,
            }),
        );

        const result = await inspectToken(mockRpc, mockMintAddress);

        const ext = result.extensions.find(e => e.name === 'ScaledUiAmountConfig');
        expect(ext?.details).toEqual({
            authority: mockAuthority,
            multiplier: 2,
            newMultiplier: 5,
            newMultiplierEffectiveTimestamp: 1790072001n,
        });
        expect(result.scaledUiAmount).toEqual({
            enabled: true,
            authority: mockAuthority,
            multiplier: 2,
            newMultiplier: 5,
            newMultiplierEffectiveTimestamp: 1790072001n,
        });
    });

    it('projects the rates into string-safe dashboard fields', () => {
        const inspection: TokenInspectionResult = {
            address: mockMintAddress,
            programId: TOKEN_2022_PROGRAM_ADDRESS,
            isToken2022: true,
            supplyInfo: { supply: 0n, decimals: 6, isInitialized: true },
            authorities: {},
            extensions: [
                { name: 'TransferFeeConfig' },
                { name: 'InterestBearingConfig' },
                { name: 'ScaledUiAmountConfig' },
            ],
            detectedPatterns: ['unknown'],
            isPausable: false,
            aclMode: 'none',
            enableSrfc37: false,
            scaledUiAmount: {
                enabled: true,
                multiplier: 2,
                authority: mockAuthority,
                newMultiplier: 5,
                newMultiplierEffectiveTimestamp: 1790072001n,
            },
            transferFee: {
                transferFeeBasisPoints: 250,
                maximumFee: 1_000_000n,
                currentEpoch: 6n,
                newerTransferFee,
                olderTransferFee,
                withheldAmount: 42n,
                authority: mockAuthority,
                withdrawAuthority: mockAuthority,
            },
            interestBearing: {
                currentRate: 500,
                preUpdateAverageRate: 400,
                initializationTimestamp: 1790000000n,
                lastUpdateTimestamp: 1790050000n,
                rateAuthority: mockAuthority,
            },
        };

        const dashboardData = inspectionResultToDashboardData(inspection);

        expect(dashboardData.multiplier).toBe(2);
        expect(dashboardData.scaledUiNewMultiplier).toBe(5);
        expect(dashboardData.scaledUiNewMultiplierEffectiveTimestamp).toBe('1790072001');
        expect(dashboardData.transferFeeBasisPoints).toBe(250);
        expect(dashboardData.transferFeeMaximum).toBe('1000000');
        expect(dashboardData.interestRate).toBe(500);
        expect(() => JSON.stringify(dashboardData)).not.toThrow();
    });
});
