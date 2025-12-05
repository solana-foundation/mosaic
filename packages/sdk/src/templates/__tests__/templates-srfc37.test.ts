import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getInitializeMintInstruction,
    extension,
    AccountState,
    getPreInitializeInstructionsForMintExtensions,
} from '@solana-program/token-2022';

describe('templates enableSrfc37 option', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    test('arcade token: enableSrfc37 false uses default account state initialized', async () => {
        const mintAuthoritySigner = createMockSigner();
        const decimals = 6;
        const { createArcadeTokenInitTransaction } = await import('../arcade-token');
        const tx = await createArcadeTokenInitTransaction(
            rpc,
            'Name',
            'SYM',
            decimals,
            'uri',
            mintAuthoritySigner,
            mint,
            feePayer,
            undefined,
            undefined,
            undefined,
            false,
        );

        const instructions = tx.instructions;
        expect(instructions.length).toBeGreaterThan(0);

        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals,
                freezeAuthority: feePayer.address,
                mintAuthority: mintAuthoritySigner.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        const hasInit = instructions.some(
            (i: Instruction) =>
                i.programAddress === expectedInit.programAddress &&
                Buffer.compare(Buffer.from(i.data ?? []), Buffer.from(expectedInit.data)) === 0,
        );
        expect(hasInit).toBe(true);

        const defaultStateExt = extension('DefaultAccountState', {
            state: AccountState.Initialized,
        });
        const [expectedDefaultStateInit] = getPreInitializeInstructionsForMintExtensions(mint.address, [
            defaultStateExt,
        ]);
        const hasDefaultInitialized = instructions.some(
            (i: Instruction) =>
                i.programAddress === expectedDefaultStateInit.programAddress &&
                Buffer.compare(Buffer.from(i.data ?? []), Buffer.from(expectedDefaultStateInit.data ?? [])) === 0,
        );
        expect(hasDefaultInitialized).toBe(true);
    });

    test('arcade token: enableSrfc37 true uses default account state frozen', async () => {
        const mintAuthoritySigner = createMockSigner();
        const decimals = 6;
        const { createArcadeTokenInitTransaction } = await import('../arcade-token');
        const tx = await createArcadeTokenInitTransaction(
            rpc,
            'Name',
            'SYM',
            decimals,
            'uri',
            mintAuthoritySigner,
            mint,
            feePayer,
            undefined,
            undefined,
            undefined,
            true,
        );

        const instructions = tx.instructions;
        expect(instructions.length).toBeGreaterThan(0);

        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals,
                freezeAuthority: feePayer.address,
                mintAuthority: mintAuthoritySigner.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        const hasInit = instructions.some(
            (i: Instruction) =>
                i.programAddress === expectedInit.programAddress &&
                Buffer.compare(Buffer.from(i.data ?? []), Buffer.from(expectedInit.data)) === 0,
        );
        expect(hasInit).toBe(true);

        const defaultStateExt = extension('DefaultAccountState', {
            state: AccountState.Frozen,
        });
        const [expectedDefaultStateInit] = getPreInitializeInstructionsForMintExtensions(mint.address, [
            defaultStateExt,
        ]);
        const hasDefaultInitialized = instructions.some(
            (i: Instruction) =>
                i.programAddress === expectedDefaultStateInit.programAddress &&
                Buffer.compare(Buffer.from(i.data ?? []), Buffer.from(expectedDefaultStateInit.data ?? [])) === 0,
        );
        expect(hasDefaultInitialized).toBe(true);
    });
});
