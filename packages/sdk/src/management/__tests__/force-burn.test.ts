import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { createMockSigner, createMockRpc, seedTokenAccount } from '../../__tests__/test-utils';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

describe('force-burn', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const wallet = 'Wall777777777777777777777777777777777777777' as Address;
    const wallet2 = 'Wall2222222222222222222222222222222222222' as Address;
    const tokenAccount = 'Ata77777777777777777777777777777777777777' as Address;
    const tokenAccount2 = 'Ata2222222222222222222222222222222222222222' as Address;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const permDel = createMockSigner('PermDel777777777777777777777777777777777');
    const wrongDel = createMockSigner('WrongDel77777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    describe('createForceBurnTransaction', () => {
        test('basic burn without thaw', async () => {
            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: false,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDel, feePayer);

            // Should only include burn instruction
            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
            expect(tx.version).toBe('legacy');
        });

        test('burn with thaw when SRFC-37 enabled and account frozen', async () => {
            // Seed token account for thaw path
            seedTokenAccount(rpc, {
                address: tokenAccount,
                mint,
                state: 'frozen',
            });

            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: true,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    extensions: [
                        { __kind: 'DefaultAccountState', state: 'frozen' },
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDel, feePayer);

            // Should include thaw and burn instructions
            expect(tx.instructions).toHaveLength(2);
            expect(tx.instructions[0].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
            expect(tx.instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });

        test('no thaw when SRFC-37 disabled even if frozen', async () => {
            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: true,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDel, feePayer);

            // Should only include burn instruction (no thaw since SRFC-37 is not enabled)
            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });

        test('handles different decimal amounts correctly', async () => {
            const testCases = [
                { decimalAmount: 1.5, decimals: 6, expectedRaw: 1500000n },
                { decimalAmount: 0.001, decimals: 9, expectedRaw: 1000000n },
                { decimalAmount: 1000, decimals: 0, expectedRaw: 1000n },
            ];

            for (const { decimalAmount, decimals, expectedRaw } of testCases) {
                jest.resetModules();
                jest.doMock('../../transaction-util', () => ({
                    resolveTokenAccount: jest.fn().mockResolvedValue({
                        tokenAccount: tokenAccount,
                        isInitialized: true,
                        isFrozen: false,
                        balance: expectedRaw,
                        uiBalance: decimalAmount,
                    }),
                    decimalAmountToRaw: jest.fn().mockReturnValue(expectedRaw),
                    getMintDetails: jest.fn().mockResolvedValue({
                        decimals,
                        freezeAuthority: null,
                        extensions: [
                            {
                                extension: 'permanentDelegate',
                                state: { delegate: permDel.address },
                            },
                        ],
                    }),
                    isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
                }));

                const { createForceBurnTransaction } = await import('../force-burn');
                const tx = await createForceBurnTransaction(rpc, mint, wallet, decimalAmount, permDel, feePayer);

                expect(tx.instructions).toHaveLength(1);
                const transactionUtil = await import('../../transaction-util');
                expect(transactionUtil.decimalAmountToRaw).toHaveBeenCalledWith(decimalAmount, decimals);
            }
        });

        test('handles string addresses for signers', async () => {
            const permDelAddress = 'PermDel777777777777777777777777777777777' as Address;
            const feePayerAddress = 'Fee777777777777777777777777777777777777' as Address;

            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: false,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDelAddress },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDelAddress, feePayerAddress);

            expect(tx.instructions).toHaveLength(1);
            expect(tx.feePayer.address).toBe(feePayerAddress);
        });

        test('burns from multiple different accounts', async () => {
            const accounts = [
                { wallet: wallet, tokenAccount: tokenAccount },
                { wallet: wallet2, tokenAccount: tokenAccount2 },
            ];

            for (const { wallet: w, tokenAccount: ta } of accounts) {
                jest.resetModules();
                jest.doMock('../../transaction-util', () => ({
                    resolveTokenAccount: jest.fn().mockResolvedValue({
                        tokenAccount: ta,
                        isInitialized: true,
                        isFrozen: false,
                        balance: 1000000n,
                        uiBalance: 1,
                    }),
                    decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                    getMintDetails: jest.fn().mockResolvedValue({
                        decimals: 6,
                        freezeAuthority: null,
                        extensions: [
                            {
                                extension: 'permanentDelegate',
                                state: { delegate: permDel.address },
                            },
                        ],
                    }),
                    isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
                }));

                const { createForceBurnTransaction } = await import('../force-burn');
                const tx = await createForceBurnTransaction(rpc, mint, w, 1, permDel, feePayer);

                expect(tx.instructions).toHaveLength(1);
                const transactionUtil = await import('../../transaction-util');
                expect(transactionUtil.resolveTokenAccount).toHaveBeenCalledWith(rpc, w, mint);
            }
        });

        test('handles uninitialized token accounts gracefully', async () => {
            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: false,
                    isFrozen: false,
                    balance: 0n,
                    uiBalance: 0,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDel, feePayer);

            // Should still create burn instruction even for uninitialized account
            expect(tx.instructions).toHaveLength(1);
        });

        test('respects different program addresses', async () => {
            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: false,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDel, feePayer);

            // Verify instruction is sent to TOKEN_2022 program
            expect(tx.instructions[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });
    });

    describe('validatePermanentDelegateForBurn', () => {
        test('passes with correct delegate', async () => {
            jest.doMock('../../transaction-util', () => ({
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
            }));

            const { validatePermanentDelegateForBurn } = await import('../force-burn');

            await expect(validatePermanentDelegateForBurn(rpc, mint, permDel.address)).resolves.toBeUndefined();
        });

        test('throws when no permanent delegate extension', async () => {
            jest.doMock('../../transaction-util', () => ({
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    extensions: [],
                }),
            }));

            const { validatePermanentDelegateForBurn } = await import('../force-burn');

            await expect(validatePermanentDelegateForBurn(rpc, mint, permDel.address)).rejects.toThrow(
                'does not have permanent delegate extension enabled',
            );
        });

        test('throws on delegate mismatch', async () => {
            jest.doMock('../../transaction-util', () => ({
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: wrongDel.address },
                        },
                    ],
                }),
            }));

            const { validatePermanentDelegateForBurn } = await import('../force-burn');

            await expect(validatePermanentDelegateForBurn(rpc, mint, permDel.address)).rejects.toThrow(
                `Permanent delegate mismatch. Expected: ${permDel.address}, Found: ${wrongDel.address}`,
            );
        });

        test('throws with other extensions but no permanent delegate', async () => {
            jest.doMock('../../transaction-util', () => ({
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    extensions: [
                        { extension: 'metadata', state: {} },
                        { extension: 'pausable', state: {} },
                    ],
                }),
            }));

            const { validatePermanentDelegateForBurn } = await import('../force-burn');

            await expect(validatePermanentDelegateForBurn(rpc, mint, permDel.address)).rejects.toThrow(
                'does not have permanent delegate extension enabled',
            );
        });

        test('handles undefined delegate in extension', async () => {
            jest.doMock('../../transaction-util', () => ({
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: undefined },
                        },
                    ],
                }),
            }));

            const { validatePermanentDelegateForBurn } = await import('../force-burn');

            await expect(validatePermanentDelegateForBurn(rpc, mint, permDel.address)).rejects.toThrow(
                'Permanent delegate mismatch',
            );
        });
    });

    describe('integration scenarios', () => {
        test('force burn from frozen account with SRFC-37 enabled', async () => {
            // Seed frozen token account
            seedTokenAccount(rpc, {
                address: tokenAccount,
                mint,
                state: 'frozen',
            });

            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: true,
                    balance: 5000000n,
                    uiBalance: 5,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(5000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                    extensions: [
                        { __kind: 'DefaultAccountState', state: 'frozen' },
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
            }));

            jest.doMock('../../token-acl', () => ({
                TOKEN_ACL_PROGRAM_ID,
                getThawPermissionlessInstructions: jest
                    .fn()
                    .mockResolvedValue([{ programAddress: TOKEN_ACL_PROGRAM_ID }]),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 5, permDel, feePayer);

            // Verify thaw is called first, then burn
            expect(tx.instructions).toHaveLength(2);
            expect(tx.instructions[0].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
            expect(tx.instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);

            const tokenAcl = await import('../../token-acl');
            expect(tokenAcl.getThawPermissionlessInstructions).toHaveBeenCalledWith({
                authority: expect.objectContaining({ address: feePayer.address }),
                mint,
                tokenAccount,
                tokenAccountOwner: wallet,
                rpc,
            });
        });

        test('force burn large amount with high precision decimals', async () => {
            const largeAmount = 999999.999999999;
            const expectedRaw = 999999999999999n; // Max safe u64 value

            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: false,
                    balance: expectedRaw,
                    uiBalance: largeAmount,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(expectedRaw),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 18,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, largeAmount, permDel, feePayer);

            expect(tx.instructions).toHaveLength(1);
            const transactionUtil = await import('../../transaction-util');
            expect(transactionUtil.decimalAmountToRaw).toHaveBeenCalledWith(largeAmount, 18);
        });

        test('handles TransactionSigner objects for all parameters', async () => {
            const permDelSigner = createMockSigner(permDel.address);
            const feePayerSigner = createMockSigner(feePayer.address);

            jest.doMock('../../transaction-util', () => ({
                resolveTokenAccount: jest.fn().mockResolvedValue({
                    tokenAccount: tokenAccount,
                    isInitialized: true,
                    isFrozen: false,
                    balance: 1000000n,
                    uiBalance: 1,
                }),
                decimalAmountToRaw: jest.fn().mockReturnValue(1000000n),
                getMintDetails: jest.fn().mockResolvedValue({
                    decimals: 6,
                    freezeAuthority: null,
                    extensions: [
                        {
                            extension: 'permanentDelegate',
                            state: { delegate: permDel.address },
                        },
                    ],
                }),
                isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
            }));

            const { createForceBurnTransaction } = await import('../force-burn');
            const tx = await createForceBurnTransaction(rpc, mint, wallet, 1, permDelSigner, feePayerSigner);

            expect(tx.instructions).toHaveLength(1);
            // Just check that the transaction was created successfully
            expect(tx.feePayer).toBeDefined();
        });
    });
});
