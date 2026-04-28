import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import {
    AccountState,
    TOKEN_2022_PROGRAM_ADDRESS,
    extension,
    getInitializeMintInstruction,
    getPreInitializeInstructionsForMintExtensions,
    getUpdateTransferHookInstruction,
    Token2022Instruction,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';
import { none } from '@solana/kit';
import { TOKEN_ACL_PROGRAM_ID } from '../../token-acl/utils';
import { createMmfInitTransaction } from '../mmf';

const matchesIx = (a: Instruction, b: Instruction) =>
    a.programAddress === b.programAddress && Buffer.compare(Buffer.from(a.data ?? []), Buffer.from(b.data ?? [])) === 0;

describe('createMmfInitTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const mint = createMockSigner();

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    test('initializes with default frozen account state and signer fee payer when SRFC-37 disabled', async () => {
        const mintAuthority = createMockSigner();
        const tx = await createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', mintAuthority, mint, feePayer);

        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals: 6,
                freezeAuthority: feePayer.address,
                mintAuthority: mintAuthority.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expectedInit))).toBe(true);

        const frozenExt = extension('DefaultAccountState', { state: AccountState.Frozen });
        const [expectedFrozenInit] = getPreInitializeInstructionsForMintExtensions(mint.address, [frozenExt]);
        expect(tx.instructions.some(i => matchesIx(i, expectedFrozenInit))).toBe(true);
    });

    test('throws when SRFC-37 is enabled but mintAuthority !== feePayer', async () => {
        // Without this guard the mint's freeze authority would be set to TOKEN_ACL_PROGRAM_ID
        // and then the function would early-return without installing the SRFC-37 config —
        // bricking freeze/thaw for the lifetime of the mint.
        const otherMintAuthority = createMockSigner('GA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');
        await expect(
            createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', otherMintAuthority, mint, feePayer, undefined, {
                enableSrfc37: true,
            }),
        ).rejects.toThrow(/enableSrfc37 requires mintAuthority === feePayer/);
    });

    test('uses TOKEN_ACL_PROGRAM_ID as freeze authority when SRFC-37 enabled', async () => {
        // SRFC-37 path requires mint authority == fee payer (signer); pass feePayer as both.
        const tx = await createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', feePayer, mint, feePayer, undefined, {
            enableSrfc37: true,
        });

        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals: 6,
                freezeAuthority: TOKEN_ACL_PROGRAM_ID,
                mintAuthority: feePayer.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expectedInit))).toBe(true);
    });

    test('clears the transfer hook program id via UpdateTransferHook(None)', async () => {
        const mintAuthority = createMockSigner();
        const tx = await createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', mintAuthority, mint, feePayer);

        const expected = getUpdateTransferHookInstruction(
            { mint: mint.address, authority: mintAuthority.address, programId: none() },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expected))).toBe(true);
    });

    test('does not include ConfidentialTransferMint by default', async () => {
        const mintAuthority = createMockSigner();
        const tx = await createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', mintAuthority, mint, feePayer);

        const hasConfidential = tx.instructions.some(
            i =>
                i.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
                identifyToken2022Instruction(i.data ?? new Uint8Array()) ===
                    Token2022Instruction.InitializeConfidentialTransferMint,
        );
        expect(hasConfidential).toBe(false);
    });

    test('includes ConfidentialTransferMint init when enableConfidentialBalances is true', async () => {
        const mintAuthority = createMockSigner();
        const tx = await createMmfInitTransaction(
            rpc,
            'MMF',
            'MMF',
            6,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            undefined,
            {
                enableConfidentialBalances: true,
            },
        );

        const hasConfidential = tx.instructions.some(
            i =>
                i.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
                identifyToken2022Instruction(i.data ?? new Uint8Array()) ===
                    Token2022Instruction.InitializeConfidentialTransferMint,
        );
        expect(hasConfidential).toBe(true);
    });
});
