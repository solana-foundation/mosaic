import type { Address, TransactionSigner } from 'gill';
import { AuthorityType, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { getUpdateAuthorityInstructions } from '../update-authority';
import { createMockSigner, generateMockAddress, TEST_AUTHORITY } from '../../__tests__/test-utils';

describe('getUpdateAuthorityInstructions', () => {
    let mockMint: Address;
    let mockCurrentAuthority: TransactionSigner<string>;
    let mockNewAuthority: Address;

    beforeEach(() => {
        mockMint = generateMockAddress() as Address;
        mockCurrentAuthority = createMockSigner();
        mockNewAuthority = generateMockAddress() as Address;
    });

    describe('when role is "Metadata"', () => {
        it('should return metadata update authority instruction', () => {
            const result = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: 'Metadata',
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);

            const instruction = result[0];
            expect(instruction).toBeDefined();
            expect(instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
            expect(instruction.accounts).toBeDefined();
            expect(instruction.data).toBeDefined();
        });

        it('should handle different mint addresses for metadata', () => {
            const customMint = TEST_AUTHORITY as Address;

            const result = getUpdateAuthorityInstructions({
                mint: customMint,
                role: 'Metadata',
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(result).toHaveLength(1);
            expect(result[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });
    });

    describe('when role is an AuthorityType', () => {
        const authorityTypes = [
            AuthorityType.MintTokens,
            AuthorityType.FreezeAccount,
            AuthorityType.AccountOwner,
            AuthorityType.CloseAccount,
            AuthorityType.TransferFeeConfig,
            AuthorityType.WithheldWithdraw,
            AuthorityType.CloseMint,
            AuthorityType.InterestRate,
            AuthorityType.PermanentDelegate,
            AuthorityType.ConfidentialTransferMint,
            AuthorityType.TransferHookProgramId,
            AuthorityType.ConfidentialTransferFeeConfig,
            AuthorityType.MetadataPointer,
            AuthorityType.GroupPointer,
            AuthorityType.GroupMemberPointer,
            AuthorityType.ScaledUiAmount,
            AuthorityType.Pause,
        ];

        authorityTypes.forEach(authorityType => {
            it(`should return set authority instruction for ${AuthorityType[authorityType]}`, () => {
                const result = getUpdateAuthorityInstructions({
                    mint: mockMint,
                    role: authorityType,
                    currentAuthority: mockCurrentAuthority,
                    newAuthority: mockNewAuthority,
                });

                expect(Array.isArray(result)).toBe(true);
                expect(result).toHaveLength(1);

                const instruction = result[0];
                expect(instruction).toBeDefined();
                expect(instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
                expect(instruction.accounts).toBeDefined();
                expect(instruction.data).toBeDefined();
            });
        });

        it('should return set authority instruction for MintTokens authority', () => {
            const result = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.MintTokens,
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(result[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });
    });

    describe('edge cases and validation', () => {
        it('should handle different new authority addresses', () => {
            const customNewAuthority = TEST_AUTHORITY as Address;

            const result = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.MintTokens,
                currentAuthority: mockCurrentAuthority,
                newAuthority: customNewAuthority,
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toBeDefined();
        });

        it('should handle different current authority signers', () => {
            const customCurrentAuthority = createMockSigner(TEST_AUTHORITY);

            const result = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.FreezeAccount,
                currentAuthority: customCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toBeDefined();
        });

        it('should produce different instructions for metadata vs authority types', () => {
            const metadataResult = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: 'Metadata',
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            const authorityResult = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.MintTokens,
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(metadataResult).toHaveLength(1);
            expect(authorityResult).toHaveLength(1);

            // Instructions should be different (different data/accounts structure)
            expect(metadataResult[0].data).not.toEqual(authorityResult[0].data);
        });
    });

    describe('function signature and types', () => {
        it('should accept all required parameters', () => {
            expect(() => {
                getUpdateAuthorityInstructions({
                    mint: mockMint,
                    role: 'Metadata',
                    currentAuthority: mockCurrentAuthority,
                    newAuthority: mockNewAuthority,
                });
            }).not.toThrow();
        });

        it('should accept AuthorityType enum values', () => {
            expect(() => {
                getUpdateAuthorityInstructions({
                    mint: mockMint,
                    role: AuthorityType.AccountOwner,
                    currentAuthority: mockCurrentAuthority,
                    newAuthority: mockNewAuthority,
                });
            }).not.toThrow();
        });

        it('should return array of instructions with correct structure', () => {
            const result = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.MintTokens,
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            result.forEach(instruction => {
                expect(typeof instruction).toBe('object');
                expect(instruction).toHaveProperty('programAddress');
                expect(instruction).toHaveProperty('accounts');
                expect(instruction).toHaveProperty('data');
                expect(typeof instruction.programAddress).toBe('string');
                expect(Array.isArray(instruction.accounts)).toBe(true);
                expect(instruction.data instanceof Uint8Array).toBe(true);
            });
        });
    });

    describe('consistent behavior', () => {
        it('should always return exactly one instruction', () => {
            // Test metadata role
            const metadataResult = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: 'Metadata',
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });
            expect(metadataResult).toHaveLength(1);

            // Test various authority types
            const authorityTypes = [
                AuthorityType.MintTokens,
                AuthorityType.FreezeAccount,
                AuthorityType.AccountOwner,
                AuthorityType.CloseAccount,
            ];

            authorityTypes.forEach(authorityType => {
                const result = getUpdateAuthorityInstructions({
                    mint: mockMint,
                    role: authorityType,
                    currentAuthority: mockCurrentAuthority,
                    newAuthority: mockNewAuthority,
                });
                expect(result).toHaveLength(1);
            });
        });

        it('should use TOKEN_2022_PROGRAM_ADDRESS for all instructions', () => {
            // Test metadata
            const metadataResult = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: 'Metadata',
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });
            expect(metadataResult[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);

            // Test authority type
            const authorityResult = getUpdateAuthorityInstructions({
                mint: mockMint,
                role: AuthorityType.MintTokens,
                currentAuthority: mockCurrentAuthority,
                newAuthority: mockNewAuthority,
            });
            expect(authorityResult[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });
    });
});
