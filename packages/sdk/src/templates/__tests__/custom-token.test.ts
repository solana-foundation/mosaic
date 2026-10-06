import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { isNone, isSome } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils.js';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    identifyToken2022Instruction,
    getInitializeTransferHookInstructionDataDecoder,
} from '@solana-program/token-2022';
import { createCustomTokenInitTransaction } from '../custom-token.js';

const findIx = (instructions: readonly Instruction[], kind: Token2022Instruction) =>
    instructions.find(
        i =>
            i.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
            identifyToken2022Instruction(i.data ?? new Uint8Array()) === kind,
    );

describe('createCustomTokenInitTransaction - Transfer Hook', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    test('initializes the transfer hook inactive (no program id) when transferHookProgramId is omitted', async () => {
        const mintAuthority = createMockSigner();
        // A bare Address authority that is not a signer: initializing inactive must not need its signature.
        const hookAuthority = createMockSigner().address;
        const tx = await createCustomTokenInitTransaction(
            rpc,
            'Token',
            'TKN',
            6,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            {
                enableTransferHook: true,
                transferHookAuthority: hookAuthority,
            },
        );

        const initIx = findIx(tx.instructions, Token2022Instruction.InitializeTransferHook);
        expect(initIx).toBeDefined();
        const data = getInitializeTransferHookInstructionDataDecoder().decode(initIx!.data!);
        expect(isSome(data.authority) && data.authority.value).toBe(hookAuthority);
        expect(isNone(data.programId)).toBe(true);
        expect(findIx(tx.instructions, Token2022Instruction.UpdateTransferHook)).toBeUndefined();
    });

    test('initializes the transfer hook with the given program id', async () => {
        const mintAuthority = createMockSigner();
        const hookProgramId = createMockSigner().address;
        const tx = await createCustomTokenInitTransaction(
            rpc,
            'Token',
            'TKN',
            6,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            {
                enableTransferHook: true,
                transferHookProgramId: hookProgramId,
            },
        );

        const initIx = findIx(tx.instructions, Token2022Instruction.InitializeTransferHook);
        expect(initIx).toBeDefined();
        const data = getInitializeTransferHookInstructionDataDecoder().decode(initIx!.data!);
        expect(isSome(data.authority) && data.authority.value).toBe(mintAuthority.address);
        expect(isSome(data.programId) && data.programId.value).toBe(hookProgramId);
        expect(findIx(tx.instructions, Token2022Instruction.UpdateTransferHook)).toBeUndefined();
    });
});
