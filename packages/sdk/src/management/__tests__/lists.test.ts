import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl';
import { ABL_PROGRAM_ID } from '../../abl/utils';
import { seedTokenAccount } from '../../__tests__/test-utils';
// Resolved to src/__mocks__/@mosaic/abl.ts by jest moduleNameMapper, where
// Mode = { Allow: 1, Block: 2 }.
import { Mode } from '@solana/token-acl-gate-sdk';

const LIST_CONFIG = 'ListCfg11111111111111111111111111111111' as Address;

/**
 * Stubs the ABL module. All four list functions derive the list config through
 * getListConfigPda, so it must be present here even though the PDA itself is irrelevant.
 */
const mockAbl = (mode: number) =>
    jest.doMock('../../abl', () => ({
        ABL_PROGRAM_ID,
        getAddWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
        getRemoveWalletInstructions: jest.fn().mockResolvedValue([{ programAddress: ABL_PROGRAM_ID }]),
        getList: jest.fn().mockResolvedValue({ mode }),
        getListConfigPda: jest.fn().mockResolvedValue(LIST_CONFIG),
    }));

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
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                usesTokenAcl: false,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
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
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                usesTokenAcl: false,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
        const { getAddToAllowlistInstructions } = await import('../allowlist');
        const ix = await getAddToAllowlistInstructions(rpc, mint, wallet, authority);
        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    });

    test('blocklist add returns freeze instruction and add to blocklist when SRFC-37 is enabled', async () => {
        mockAbl(Mode.Block);
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
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                usesTokenAcl: true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
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
        mockAbl(Mode.Allow);
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata66666666666666666666666666666666666666',
                isInitialized: true,
                isFrozen: true,
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                extensions: [{ __kind: 'DefaultAccountState', state: 'frozen' }],
                usesTokenAcl: true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
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

/**
 * HOO-903 regression suite.
 *
 * A Token-ACL mint whose DefaultAccountState is Initialized rather than Frozen is the normal
 * shape for a blocklist token — the stablecoin and tokenized-security templates build it that
 * way, and apps/app always does. List management used to require
 * `usesTokenAcl && defaultAccountState == frozen`, so for these mints it fell through to a plain
 * Token-2022 freeze/thaw signed by the caller. That can never land, because Token ACL owns the
 * freeze authority — and the ABL instruction was never emitted at all.
 *
 * Every test here therefore mocks isDefaultAccountStateSetFrozen to **false** while
 * usesTokenAcl is **true**, and asserts no Token-2022 instruction is produced.
 */
describe('Token-ACL list actions with DefaultAccountState=Initialized', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const wallet = 'Wall777777777777777777777777777777777777777' as Address;
    const tokenAccount = 'Ata77777777777777777777777777777777777777' as Address;
    const authority = createMockSigner('Auth77777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
        // The freeze paths go through getFreezeInstructions, which fetches the token account.
        seedTokenAccount(rpc, { address: tokenAccount, mint, state: 'initialized' });
    });

    const mockTransactionUtil = (account: { isInitialized: boolean; isFrozen: boolean }) =>
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount,
                ...account,
                balance: 0n,
                uiBalance: 0,
            }),
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 6,
                // Token ACL has taken over the freeze authority...
                freezeAuthority: 'MintCfgMock1111111111111111111111111111111',
                // ...but accounts are still born usable.
                extensions: [{ extension: 'defaultAccountState', state: { accountState: 'initialized' } }],
                usesTokenAcl: true,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));

    test('blocklist add emits ABL addWallet plus a Token-ACL freeze', async () => {
        mockAbl(Mode.Block);
        mockTransactionUtil({ isInitialized: true, isFrozen: false });

        const { getAddToBlocklistInstructions } = await import('../blocklist');
        const ix = await getAddToBlocklistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(2);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
        // The bug: a single unsignable Token-2022 freeze instead of the two above.
        expect(ix.every(i => i.programAddress !== TOKEN_2022_PROGRAM_ADDRESS)).toBe(true);
    });

    test('blocklist remove emits ABL removeWallet plus a Token-ACL thaw, in that order', async () => {
        mockAbl(Mode.Block);
        mockTransactionUtil({ isInitialized: true, isFrozen: true });

        const { getRemoveFromBlocklistInstructions } = await import('../blocklist');
        const ix = await getRemoveFromBlocklistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(2);
        // removeWallet must precede the thaw: the ABL gate is evaluated at execution time, so
        // the wallet has to be off the list before the permissionless thaw is allowed.
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
        expect(ix.every(i => i.programAddress !== TOKEN_2022_PROGRAM_ADDRESS)).toBe(true);
    });

    test('allowlist add emits ABL addWallet plus a Token-ACL thaw', async () => {
        mockAbl(Mode.Allow);
        mockTransactionUtil({ isInitialized: true, isFrozen: true });

        const { getAddToAllowlistInstructions } = await import('../allowlist');
        const ix = await getAddToAllowlistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(2);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
        expect(ix.every(i => i.programAddress !== TOKEN_2022_PROGRAM_ADDRESS)).toBe(true);
    });

    // Removing allowlist membership has to freeze an account that is still *usable*. The
    // condition used to be `isFrozen`, so it only acted on accounts that were already frozen
    // and removed wallets kept transacting.
    test('allowlist remove freezes an account that is not yet frozen', async () => {
        mockAbl(Mode.Allow);
        mockTransactionUtil({ isInitialized: true, isFrozen: false });

        const { getRemoveFromAllowlistInstructions } = await import('../allowlist');
        const ix = await getRemoveFromAllowlistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(2);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
        expect(ix[1].programAddress).toBe(TOKEN_ACL_PROGRAM_ID);
        expect(ix.every(i => i.programAddress !== TOKEN_2022_PROGRAM_ADDRESS)).toBe(true);
    });

    test('allowlist remove skips the freeze when the account is already frozen', async () => {
        mockAbl(Mode.Allow);
        mockTransactionUtil({ isInitialized: true, isFrozen: true });

        const { getRemoveFromAllowlistInstructions } = await import('../allowlist');
        const ix = await getRemoveFromAllowlistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
    });

    // resolveTokenAccount reports a non-existent ATA as `isFrozen: true`, so `isInitialized` is
    // what stops all four functions from emitting freeze/thaw against an account that is not
    // there yet.
    test('blocklist add emits only the ABL instruction when the ATA does not exist', async () => {
        mockAbl(Mode.Block);
        mockTransactionUtil({ isInitialized: false, isFrozen: true });

        const { getAddToBlocklistInstructions } = await import('../blocklist');
        const ix = await getAddToBlocklistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
    });

    test('allowlist remove emits only the ABL instruction when the ATA does not exist', async () => {
        mockAbl(Mode.Allow);
        mockTransactionUtil({ isInitialized: false, isFrozen: true });

        const { getRemoveFromAllowlistInstructions } = await import('../allowlist');
        const ix = await getRemoveFromAllowlistInstructions(rpc, mint, wallet, authority);

        expect(ix).toHaveLength(1);
        expect(ix[0].programAddress).toBe(ABL_PROGRAM_ID);
    });

    test('blocklist add rejects when the mint list is an allowlist', async () => {
        mockAbl(Mode.Allow);
        mockTransactionUtil({ isInitialized: true, isFrozen: false });

        const { getAddToBlocklistInstructions } = await import('../blocklist');
        await expect(getAddToBlocklistInstructions(rpc, mint, wallet, authority)).rejects.toThrow(
            /not an ABL blocklist/,
        );
    });

    test('allowlist add rejects when the mint list is a blocklist', async () => {
        mockAbl(Mode.Block);
        mockTransactionUtil({ isInitialized: true, isFrozen: true });

        const { getAddToAllowlistInstructions } = await import('../allowlist');
        await expect(getAddToAllowlistInstructions(rpc, mint, wallet, authority)).rejects.toThrow(
            /not an ABL allowlist/,
        );
    });
});
