import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
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

    test('SRFC-37 sponsored deploy: feePayer !== mintAuthority uses the mint authority as freeze authority', async () => {
        // Sponsored (e.g. Kora) deploy: the fee payer funds account creation via `payer`
        // while the mint authority stays the freeze authority that create_config validates
        // and hands to the config PDA. This must not throw and must not use the fee payer as
        // the freeze authority. Distinct addresses — createMockSigner() defaults them equal.
        const sponsorFeePayer = createMockSigner('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');
        const custodyMintAuthority = createMockSigner('So11111111111111111111111111111111111111112');
        const mmfMint = createMockSigner('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
        const tx = await createMmfInitTransaction(
            rpc,
            'MMF',
            'MMF',
            6,
            'uri',
            custodyMintAuthority,
            mmfMint,
            sponsorFeePayer,
            undefined,
            { enableSrfc37: true },
        );

        const expectedInit = getInitializeMintInstruction(
            {
                mint: mmfMint.address,
                decimals: 6,
                freezeAuthority: custodyMintAuthority.address,
                mintAuthority: custodyMintAuthority.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(tx.instructions.some(i => matchesIx(i, expectedInit))).toBe(true);
    });

    test('uses the mint authority as freeze authority when SRFC-37 enabled', async () => {
        // feePayer === mintAuthority here (non-sponsored); pass feePayer as both.
        const tx = await createMmfInitTransaction(rpc, 'MMF', 'MMF', 6, 'uri', feePayer, mint, feePayer, undefined, {
            enableSrfc37: true,
        });

        // Freeze authority is the mint authority (here === feePayer); Token-ACL create_config
        // validates it and then reassigns freeze authority to its config PDA.
        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals: 6,
                freezeAuthority: feePayer.address,
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

    test('custom transferHookAuthority Signer is attached to the UpdateTransferHook ix', async () => {
        // The ix data is identical whether authority is passed as Address or Signer (it's
        // encoded by address). The difference is the *account meta*: a real partial-signer
        // provided to the ix builder produces a meta with `signer` set, which the kit's
        // signTransactionMessageWithSigners uses to sign the tx. If we passed only a bare
        // Address (or, before this fix, a typed-Address-only option), no signer would be
        // attached and signing would silently skip it.
        // Use generateKeyPairSigner so the kit's isTransactionSigner check recognizes it
        // (it requires signTransactions/modifyAndSignTransactions/signAndSendTransactions).
        const mintAuthority = await generateKeyPairSigner();
        const customHookAuthority = await generateKeyPairSigner();
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
                transferHookAuthority: customHookAuthority,
            },
        );

        const updateIx = tx.instructions.find(
            i =>
                i.programAddress === TOKEN_2022_PROGRAM_ADDRESS &&
                identifyToken2022Instruction(i.data ?? new Uint8Array()) === Token2022Instruction.UpdateTransferHook,
        );
        expect(updateIx).toBeDefined();

        const authorityMeta = updateIx!.accounts?.find(a => a.address === customHookAuthority.address) as
            | { address: string; signer?: unknown }
            | undefined;
        expect(authorityMeta).toBeDefined();
        expect(authorityMeta!.signer).toBe(customHookAuthority);
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
