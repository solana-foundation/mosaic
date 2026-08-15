import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import { decimalAmountToRaw } from '../../transaction-util';

// parseFloat('9007199254740993') === 9007199254740992 (2^53 + 1 is not
// representable as a JS number). The exact decimal string must reach
// decimalAmountToRaw untouched, or the user mints/burns/transfers a different
// on-chain amount than they typed.
const PRECISE_AMOUNT = '9007199254740993';

const mint = 'Mint777777777777777777777777777777777777777' as Address;
const account = 'Wall777777777777777777777777777777777777777' as Address;

describe('management amount precision', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const authority = createMockSigner('Auth7777777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    function mockTransactionUtil(decimalAmountToRaw: jest.Mock) {
        jest.doMock('../../transaction-util', () => ({
            resolveTokenAccount: jest.fn().mockResolvedValue({
                tokenAccount: 'Ata77777777777777777777777777777777777777',
                isInitialized: true,
                isFrozen: false,
                balance: 10_000_000_000_000_000n,
                uiBalance: 0,
            }),
            decimalAmountToRaw,
            getMintDetails: jest.fn().mockResolvedValue({
                decimals: 0,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                usesTokenAcl: false,
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));
    }

    test('rejects fractional precision that would otherwise be truncated', () => {
        expect(() => decimalAmountToRaw('0.0000001', 6)).toThrow('Amount cannot have more than 6 decimal places');
    });

    test('createMintToTransaction forwards the exact decimal string', async () => {
        const decimalAmountToRaw = jest.fn().mockReturnValue(1n);
        mockTransactionUtil(decimalAmountToRaw);
        const { createMintToTransaction } = await import('../mint');
        await createMintToTransaction(rpc, mint, account, PRECISE_AMOUNT, authority, feePayer).catch(() => {});
        expect(decimalAmountToRaw).toHaveBeenCalledWith(PRECISE_AMOUNT, 0);
    });

    test('createBurnTransaction forwards the exact decimal string', async () => {
        const decimalAmountToRaw = jest.fn().mockReturnValue(1n);
        mockTransactionUtil(decimalAmountToRaw);
        const { createBurnTransaction } = await import('../burn');
        await createBurnTransaction(rpc, mint, authority, PRECISE_AMOUNT, feePayer).catch(() => {});
        expect(decimalAmountToRaw).toHaveBeenCalledWith(PRECISE_AMOUNT, 0);
    });

    test('createForceBurnTransaction forwards the exact decimal string', async () => {
        const decimalAmountToRaw = jest.fn().mockReturnValue(1n);
        mockTransactionUtil(decimalAmountToRaw);
        const { createForceBurnTransaction } = await import('../force-burn');
        await createForceBurnTransaction(rpc, mint, account, PRECISE_AMOUNT, authority, feePayer).catch(() => {});
        expect(decimalAmountToRaw).toHaveBeenCalledWith(PRECISE_AMOUNT, 0);
    });

    test('createForceTransferTransaction forwards the exact decimal string', async () => {
        const decimalAmountToRaw = jest.fn().mockReturnValue(1n);
        mockTransactionUtil(decimalAmountToRaw);
        const { createForceTransferTransaction } = await import('../force-transfer');
        await createForceTransferTransaction(rpc, mint, account, account, PRECISE_AMOUNT, authority, feePayer).catch(
            () => {},
        );
        expect(decimalAmountToRaw).toHaveBeenCalledWith(PRECISE_AMOUNT, 0);
    });
});
