import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { none } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getUpdateTransferHookInstruction,
    Token2022Instruction,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';
import { createCustomTokenInitTransaction } from '../custom-token';

const matchesIx = (a: Instruction, b: Instruction) =>
    a.programAddress === b.programAddress && Buffer.compare(Buffer.from(a.data ?? []), Buffer.from(b.data ?? [])) === 0;

describe('createCustomTokenInitTransaction - Transfer Hook', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    test('clears the transfer hook program id via UpdateTransferHook(None) when transferHookProgramId is omitted', async () => {
        const mintAuthority = createMockSigner();
        const tx = await createCustomTokenInitTransaction(rpc, 'Token', 'TKN', 6, 'uri', mintAuthority, mint, feePayer, {
            enableTransferHook: true,
        });

        const expected = getUpdateTransferHookInstruction(
            { mint: mint.address, authority: mintAuthority.address, programId: none() },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expected))).toBe(true);
    });

    test('does not clear the transfer hook program id when transferHookProgramId is provided', async () => {
        const mintAuthority = createMockSigner();
        const hookProgramId = createMockSigner().address;
        const tx = await createCustomTokenInitTransaction(rpc, 'Token', 'TKN', 6, 'uri', mintAuthority, mint, feePayer, {
            enableTransferHook: true,
            transferHookProgramId: hookProgramId,
        });

        const updateIx = tx.instructions.find(
            i =>
                i.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
                identifyToken2022Instruction(i.data ?? new Uint8Array()) === Token2022Instruction.UpdateTransferHook,
        );
        expect(updateIx).toBeUndefined();
    });
});
