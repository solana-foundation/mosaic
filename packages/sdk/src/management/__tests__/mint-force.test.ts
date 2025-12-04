import type { Address, Rpc, SolanaRpcApi } from 'gill';
import { TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl';

describe('non-SRFC-37: mint/force-transfer should not include permissionless thaw', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const wallet = 'Wall777777777777777777777777777777777777777' as Address;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const mintAuthority = createMockSigner('MintAuth77777777777777777777777777777777777');
    const permDel = createMockSigner('PermDel777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    test('createMintToTransaction: no thaw permissionless when SRFC-37 disabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata77777777777777777777777777777777777777',
                isInitialized: true,
                isFrozen: true,
                balance: 0n,
                uiBalance: 0,
            }),
            decimalAmountToRaw: jest.fn().mockReturnValue(1n),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
        const { createMintToTransaction } = await import('../mint');
        const tx = await createMintToTransaction(rpc, mint, wallet, 1, mintAuthority, feePayer);
        expect(tx.instructions.some(i => i.programAddress !== undefined)).toBe(true);
        expect(tx.instructions.length).toBe(2);
    });

    test('createForceTransferTransaction: no thaw permissionless when SRFC-37 disabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest
                .fn()
                .mockResolvedValueOnce({
                    tokenAccount: 'FromATA',
                    isInitialized: true,
                    isFrozen: false,
                    balance: 0n,
                    uiBalance: 0,
                })
                .mockResolvedValueOnce({
                    tokenAccount: 'ToATA',
                    isInitialized: false,
                    isFrozen: false,
                    balance: 0n,
                    uiBalance: 0,
                }),
            decimalAmountToRaw: jest.fn().mockReturnValue(1n),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
        const { createForceTransferTransaction } = await import('../force-transfer');
        const tx = await createForceTransferTransaction(rpc, mint, wallet, wallet, 1, permDel, feePayer);
        // Should only include transfer (and create ATA) but not thaw-permissionless
        expect(tx.instructions.length).toBe(2);
    });

    test('createMintToTransaction: thaw permissionless when SRFC-37 is enabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata77777777777777777777777777777777777777',
                isInitialized: false,
                isFrozen: true,
                balance: 0n,
                uiBalance: 0,
            }),
            decimalAmountToRaw: jest.fn().mockReturnValue(1n),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                usesTokenAcl: true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
        }));
        const { createMintToTransaction } = await import('../mint');
        const tx = await createMintToTransaction(rpc, mint, wallet, 1, mintAuthority, feePayer);
        // Should include mint, create ATA, and thaw-permissionless
        expect(tx.instructions.length).toBe(3);
    });

    test('createForceTransferTransaction: thaw permissionless when SRFC-37 is enabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest
                .fn()
                .mockResolvedValueOnce({
                    tokenAccount: 'FromATA',
                    isInitialized: true,
                    isFrozen: false,
                    balance: 0n,
                    uiBalance: 0,
                })
                .mockResolvedValueOnce({
                    tokenAccount: 'ToATA',
                    isInitialized: false,
                    isFrozen: true,
                    balance: 0n,
                    uiBalance: 0,
                }),
            decimalAmountToRaw: jest.fn().mockReturnValue(1n),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
        }));
        const { createForceTransferTransaction } = await import('../force-transfer');
        const tx = await createForceTransferTransaction(rpc, mint, wallet, wallet, 1, permDel, feePayer);
        // Should include transfer, create ATA, and thaw-permissionless
        expect(tx.instructions.length).toBe(3);
    });
});
