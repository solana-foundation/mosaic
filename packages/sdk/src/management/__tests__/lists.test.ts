import type { Address, Rpc, SolanaRpcApi } from 'gill';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import { TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import { ABL_PROGRAM_ID } from '../../abl/utils';
import { seedTokenAccount } from '../../__tests__/test-utils';

describe('non-SRFC-37 list actions produce direct freeze/thaw', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint555555555555555555555555555555555555555' as Address;
    const wallet = 'Wall555555555555555555555555555555555555555' as Address;
    const authority = createMockSigner('Auth55555555555555555555555555555555555');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    test('blocklist add returns freeze instruction when SRFC-37 disabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata55555555555555555555555555555555555555',
                isInitialized: true,
                isFrozen: false,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
        const { getAddToBlocklistInstructions } = await import('../blocklist');
        const ix = await getAddToBlocklistInstructions(rpc, mint, wallet, authority);
        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    });

    test('allowlist add returns thaw instruction when SRFC-37 disabled', async () => {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata66666666666666666666666666666666666666',
                isInitialized: true,
                isFrozen: true,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
        const { getAddToAllowlistInstructions } = await import('../allowlist');
        const ix = await getAddToAllowlistInstructions(rpc, mint, wallet, authority);
        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    });

    test('blocklist add returns freeze instruction and add to blocklist when SRFC-37 is enabled', async () => {
        jest.doMock('../../abl', () => ({
            ABL_PROGRAM_ID,
            getAddWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
            getRemoveWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
            getList: jest.fn().mockResolvedValue({ mode: 2 }),
        }));
        // Seed token account used by freeze path
        seedTokenAccount(rpc, {
            address: 'Ata55555555555555555555555555555555555555' as Address,
            mint,
            state: 'initialized',
        });
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata55555555555555555555555555555555555555',
                isInitialized: true,
                isFrozen: false,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                usesTokenAcl: true,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
        }));
        const { getAddToBlocklistInstructions } = await import('../blocklist');
        const ix = await getAddToBlocklistInstructions(rpc, mint, wallet, authority);
        // 1 for add to blocklist, 1 for freeze
        expect(ix).toHaveLength(2);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
    });

    test('allowlist add returns thaw instruction and add to allowlist when SRFC-37 is enabled', async () => {
        jest.doMock('../../abl', () => ({
            ABL_PROGRAM_ID,
            getAddWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
            getRemoveWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
            getList: jest.fn().mockResolvedValue({ mode: 1 }),
            getListConfigPda: jest.fn().mockResolvedValue('ListCfg11111111111111111111111111111111'),
        }));
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata66666666666666666666666666666666666666',
                isInitialized: true,
                isFrozen: true,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                usesTokenAcl: true,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(true),
        }));
        const { getAddToAllowlistInstructions } = await import('../allowlist');
        const ix = await getAddToAllowlistInstructions(rpc, mint, wallet, authority);
        // 1 for add to allowlist, 1 for thaw permissionless
        expect(ix).toHaveLength(2);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
    });
});
