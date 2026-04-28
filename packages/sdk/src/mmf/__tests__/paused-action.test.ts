import type { Instruction, Rpc, SolanaRpcApi } from '@solana/kit';
import { address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    getMintToCheckedInstruction,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';
import { createPausedActionTransaction } from '../paused-action';

const MINT = address('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
const TARGET = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

describe('createPausedActionTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const pauseAuthority = createMockSigner('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');
    const mintAuthority = createMockSigner('JA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

    beforeEach(() => {
        rpc = createMockRpc();
    });

    test('produces [resume, ...mid, pause]', async () => {
        const mid: Instruction[] = [
            getMintToCheckedInstruction(
                { mint: MINT, mintAuthority, token: TARGET, amount: 1n, decimals: 6 },
                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
            ),
        ];
        const tx = await createPausedActionTransaction(rpc, {
            mint: MINT,
            pauseAuthority,
            feePayer,
            instructions: mid,
        });

        const types = tx.instructions.map(i => identifyToken2022Instruction(i.data ?? new Uint8Array()));
        expect(types).toEqual([
            Token2022Instruction.Resume,
            Token2022Instruction.MintToChecked,
            Token2022Instruction.Pause,
        ]);
    });

    test('preserves ordering and count for multi-instruction middle', async () => {
        const mid: Instruction[] = [
            getMintToCheckedInstruction(
                { mint: MINT, mintAuthority, token: TARGET, amount: 1n, decimals: 6 },
                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
            ),
            getMintToCheckedInstruction(
                { mint: MINT, mintAuthority, token: TARGET, amount: 2n, decimals: 6 },
                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
            ),
        ];
        const tx = await createPausedActionTransaction(rpc, {
            mint: MINT,
            pauseAuthority,
            feePayer,
            instructions: mid,
        });

        expect(tx.instructions).toHaveLength(4);
        expect(identifyToken2022Instruction(tx.instructions[0].data ?? new Uint8Array())).toBe(
            Token2022Instruction.Resume,
        );
        expect(identifyToken2022Instruction(tx.instructions[3].data ?? new Uint8Array())).toBe(
            Token2022Instruction.Pause,
        );
    });
});
