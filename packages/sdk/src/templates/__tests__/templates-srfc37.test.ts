import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getInitializeMintInstruction,
    extension,
    AccountState,
    getPreInitializeInstructionsForMintExtensions,
} from '@solana-program/token-2022';
import * as createConfigModule from '../../token-acl/create-config';
import * as setGatingProgramModule from '../../token-acl/set-gating-program';
import * as enableThawModule from '../../token-acl/enable-permissionless-thaw';
import * as createListModule from '../../abl/list';
import * as setExtraMetasModule from '../../abl/set-extra-metas';

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

    test('arcade token: enableSrfc37 true uses default account state frozen and the mint authority as freeze authority', async () => {
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

        // When SRFC-37 is enabled, freeze authority should be the mint authority — Token-ACL
        // create_config validates it and then reassigns freeze authority to its config PDA.
        const expectedInit = getInitializeMintInstruction(
            {
                mint: mint.address,
                decimals,
                freezeAuthority: mintAuthoritySigner.address,
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

/**
 * Regression for the sRFC-37 ABL deploy bug: when the fee payer differs from the
 * mint authority (sponsored / Kora deploy), templates used to (a) silently emit a
 * bare mint with no Token-ACL/ABL setup and (b) use the fee payer as the on-chain
 * authority — keying the config/list PDAs off the wrong account. The fix relaxes the
 * guard to `if (!useSrfc37)` and splits the roles: authority = mint authority,
 * account creation funded by the fee payer via `payer`.
 */
describe('templates fee-payer / authority decoupling (sRFC-37)', () => {
    let rpc: Rpc<SolanaRpcApi>;
    // Distinct, valid base58 addresses — createMockSigner() defaults all signers to
    // the same address, which would mask the decoupling.
    const mintAuthority = createMockSigner('So11111111111111111111111111111111111111112');
    const feePayer = createMockSigner('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');
    const mint = createMockSigner('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
    const decimals = 6;

    let createConfigSpy: jest.SpyInstance;
    let setGatingProgramSpy: jest.SpyInstance;
    let enableThawSpy: jest.SpyInstance;
    let createListSpy: jest.SpyInstance;
    let setExtraMetasSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.restoreAllMocks();
        rpc = createMockRpc();
        // Spy with call-through so the real wrappers (and the suite's ABL mocks) still run.
        createConfigSpy = jest.spyOn(createConfigModule, 'getCreateConfigInstructions');
        setGatingProgramSpy = jest.spyOn(setGatingProgramModule, 'getSetGatingProgramInstructions');
        enableThawSpy = jest.spyOn(enableThawModule, 'getEnablePermissionlessThawInstructions');
        createListSpy = jest.spyOn(createListModule, 'getCreateListInstructions');
        setExtraMetasSpy = jest.spyOn(setExtraMetasModule, 'getSetExtraMetasInstructions');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * Verifies the two halves of the fix:
     * 1. Guard relaxation — the full Token-ACL/ABL setup is emitted even though
     *    feePayer !== mintAuthority (pre-fix it was silently skipped).
     * 2. Role split — the on-chain authority is the mint authority (so config/list
     *    PDAs are keyed off custody), while account creation is funded by the fee
     *    payer via `payer`. setGatingProgram / enablePermissionlessThaw create no
     *    accounts, so they take only the authority.
     */
    const expectDecoupledAblSetup = () => {
        expect(createConfigSpy).toHaveBeenCalledTimes(1);
        expect(setGatingProgramSpy).toHaveBeenCalledTimes(1);
        expect(enableThawSpy).toHaveBeenCalledTimes(1);
        expect(createListSpy).toHaveBeenCalledTimes(1);
        expect(setExtraMetasSpy).toHaveBeenCalledTimes(1);

        expect(createConfigSpy).toHaveBeenCalledWith(
            expect.objectContaining({ authority: mintAuthority, payer: feePayer }),
        );
        expect(createListSpy).toHaveBeenCalledWith(
            expect.objectContaining({ authority: mintAuthority, payer: feePayer }),
        );
        expect(setExtraMetasSpy).toHaveBeenCalledWith(
            expect.objectContaining({ authority: mintAuthority, payer: feePayer }),
        );
        expect(setGatingProgramSpy).toHaveBeenCalledWith(expect.objectContaining({ authority: mintAuthority }));
        expect(enableThawSpy).toHaveBeenCalledWith(expect.objectContaining({ authority: mintAuthority }));
    };

    test('stablecoin: sponsored deploy emits decoupled ABL setup', async () => {
        const { createStablecoinInitTransaction } = await import('../stablecoin');
        await createStablecoinInitTransaction(
            rpc,
            'Name',
            'SYM',
            decimals,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            'blocklist',
            undefined,
            undefined,
            undefined,
            undefined,
            true,
        );
        expectDecoupledAblSetup();
    });

    test('tokenized-security: sponsored deploy emits decoupled ABL setup', async () => {
        const { createTokenizedSecurityInitTransaction } = await import('../tokenized-security');
        await createTokenizedSecurityInitTransaction(
            rpc,
            'Name',
            'SYM',
            decimals,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            undefined,
            {
                enableSrfc37: true,
                aclMode: 'blocklist',
            },
        );
        expectDecoupledAblSetup();
    });

    test('arcade token: sponsored deploy emits decoupled ABL setup', async () => {
        const { createArcadeTokenInitTransaction } = await import('../arcade-token');
        await createArcadeTokenInitTransaction(
            rpc,
            'Name',
            'SYM',
            decimals,
            'uri',
            mintAuthority,
            mint,
            feePayer,
            undefined,
            undefined,
            undefined,
            true,
        );
        expectDecoupledAblSetup();
    });

    test('custom token: sponsored deploy emits decoupled ABL setup', async () => {
        const { createCustomTokenInitTransaction } = await import('../custom-token');
        await createCustomTokenInitTransaction(rpc, 'Name', 'SYM', decimals, 'uri', mintAuthority, mint, feePayer, {
            enableSrfc37: true,
            aclMode: 'blocklist',
        });
        expectDecoupledAblSetup();
    });
});
