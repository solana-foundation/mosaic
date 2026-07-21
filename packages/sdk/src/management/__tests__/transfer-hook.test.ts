import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { none } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import { TOKEN_2022_PROGRAM_ADDRESS, getUpdateTransferHookInstruction } from '@solana-program/token-2022';
import { createUpdateTransferHookTransaction } from '../transfer-hook';

const matchesIx = (a: Instruction, b: Instruction) =>
    a.programAddress === b.programAddress && Buffer.compare(Buffer.from(a.data ?? []), Buffer.from(b.data ?? [])) === 0;

describe('createUpdateTransferHookTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const authority = createMockSigner();
    const mint = createMockSigner().address;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    test('sets a new hook program id', async () => {
        const programId = createMockSigner().address;
        const tx = await createUpdateTransferHookTransaction(rpc, { mint, authority, programId, feePayer });

        const expected = getUpdateTransferHookInstruction(
            { mint, authority: authority.address, programId },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expected))).toBe(true);
    });

    test('clears the hook program id when programId is null', async () => {
        const tx = await createUpdateTransferHookTransaction(rpc, { mint, authority, programId: null, feePayer });

        const expected = getUpdateTransferHookInstruction(
            { mint, authority: authority.address, programId: none() },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expected))).toBe(true);
    });
});
