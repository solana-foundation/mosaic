import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';

describe('createTransferInstructions amount precision', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const to = 'Wall777777777777777777777777777777777777777' as Address;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const authority = createMockSigner('Auth7777777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
    });

    test('passes the exact decimal string, not a parsed float, to decimalAmountToRaw', async () => {
        const decimalAmountToRaw = jest.fn().mockReturnValue(1n);
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
                decimals: 6,
                freezeAuthority: 'NotTokenACL111111111111111111111111111111',
                extensions: [],
                programAddress: TOKEN_2022_PROGRAM_ADDRESS,
            }),
            isDefaultAccountStateSetFrozen: jest.fn().mockReturnValue(false),
        }));

        const { createTransferInstructions } = await import('../index');

        // 16 significant digits: parseFloat('9999999999.999999') === 9999999999.999998,
        // so the buggy path handed decimalAmountToRaw a lossy number. The string must
        // reach the converter untouched (its digit-by-digit path is precise).
        await createTransferInstructions({
            rpc,
            mint,
            from: authority.address,
            to,
            feePayer,
            authority,
            amount: '9999999999.999999',
        }).catch(() => {
            // Downstream instruction building is out of scope; decimalAmountToRaw
            // is invoked before it, so the argument assertion below still holds.
        });

        expect(decimalAmountToRaw).toHaveBeenCalledWith('9999999999.999999', 6);
    });
});
