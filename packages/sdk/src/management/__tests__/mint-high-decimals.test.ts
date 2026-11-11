import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { getMintToInstructionDataDecoder } from '@solana-program/token-2022';
import { createMockSigner, createMockRpc, mockTransactionUtilWithRealAmounts } from '../../__tests__/test-utils.js';

describe('createMintToTransaction: mint with more than 9 decimals', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const wallet = 'Wall777777777777777777777777777777777777777' as Address;
    const feePayer = createMockSigner('Fee777777777777777777777777777777777777');
    const mintAuthority = createMockSigner('MintAuth77777777777777777777777777777777777');

    beforeEach(() => {
        jest.resetModules();
        rpc = createMockRpc();
        mockTransactionUtilWithRealAmounts(18);
    });

    test('encodes the amount scaled by 18 decimals', async () => {
        const { createMintToTransaction } = await import('../mint.js');
        const tx = await createMintToTransaction(rpc, mint, wallet, 1.5, mintAuthority, feePayer);
        const { amount } = getMintToInstructionDataDecoder().decode(tx.instructions[1].data!);
        expect(amount).toBe(1_500_000_000_000_000_000n);
    });

    test('rejects an amount that overflows u64 at 18 decimals', async () => {
        const { createMintToTransaction } = await import('../mint.js');
        await expect(createMintToTransaction(rpc, mint, wallet, 100, mintAuthority, feePayer)).rejects.toThrow(
            'Amount exceeds the maximum u64 token amount',
        );
    });
});
