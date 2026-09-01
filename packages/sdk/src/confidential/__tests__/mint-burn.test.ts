import type { Address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import type { ConfidentialKeys } from '../keys';

// --- Mocks --------------------------------------------------------------------
// mint.ts / burn.ts are thin wrappers over the official token-2022 confidential
// mint/burn `InstructionPlan` helpers (`@solana-program/token-2022/confidential`).
// The proof generation + context-state assembly now live upstream (and are
// covered by token-2022's own tests), so these tests assert only the Mosaic
// *wrapper* contract: the prerequisite fail-fast guards and correct argument
// mapping (decimal scaling, decoded accounts, threaded keys) into the upstream
// helper. We mock the upstream helpers and stub the RPC fetches.

const mintPlan = { kind: 'sequential' as const, id: 'mint-plan' };
const burnPlan = { kind: 'sequential' as const, id: 'burn-plan' };
const permissionedBurnPlan = { kind: 'sequential' as const, id: 'permissioned-burn-plan' };
const mockGetConfidentialMintInstructionPlan = jest.fn(async (_input: unknown) => mintPlan);
const mockGetConfidentialBurnInstructionPlan = jest.fn(async (_input: unknown) => burnPlan);
const mockGetPermissionedConfidentialBurnInstructionPlan = jest.fn(async (_input: unknown) => permissionedBurnPlan);
/**
 * The decryptable-supply instruction the real helper builds; stubbed here because
 * `burn.ts`'s `resyncSupply` path only needs to be shown to sequence it after the
 * apply and to forward the supply keys. Its real AES encoding + encoding-level
 * assertions live in `supply.test.ts`, against real WASM keys.
 */
const updateDecryptableSupplyIx = {
    programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address,
    accounts: [],
    data: new Uint8Array([0xff]),
};
const mockGetUpdateDecryptableSupplyInstruction = jest.fn((_input: unknown) => updateDecryptableSupplyIx);
jest.mock('@solana-program/token-2022/confidential', () => ({
    getConfidentialMintInstructionPlan: (input: unknown) => mockGetConfidentialMintInstructionPlan(input),
    getConfidentialBurnInstructionPlan: (input: unknown) => mockGetConfidentialBurnInstructionPlan(input),
    getPermissionedConfidentialBurnInstructionPlan: (input: unknown) =>
        mockGetPermissionedConfidentialBurnInstructionPlan(input),
    getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply: (input: unknown) =>
        mockGetUpdateDecryptableSupplyInstruction(input),
}));

let mockMintDecimals = 6;
let mockMintExtensions: unknown[] = [];
let mockTokenExtensions: unknown[] = [];
const mockMintData = () => ({
    data: { decimals: mockMintDecimals, extensions: { __option: 'Some', value: mockMintExtensions } },
});
const mockTokenData = () => ({ data: { extensions: { __option: 'Some', value: mockTokenExtensions } } });

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(async () => mockMintData()),
    fetchToken: jest.fn(async () => mockTokenData()),
}));

import {
    APPLY_CONFIDENTIAL_PENDING_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    APPLY_CONFIDENTIAL_PENDING_BURN_DISCRIMINATOR,
    getApplyConfidentialPendingBurnInstructionDataDecoder,
} from '@solana-program/token-2022';
import { createConfidentialMintInstructionPlan } from '../mint';
import { createApplyConfidentialPendingBurnInstructionPlan, createConfidentialBurnInstructionPlan } from '../burn';

const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;
const DEST_TOKEN = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const SOURCE_TOKEN = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const AUTHORITY = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;
const SUPPLY_PK = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;
const ACCOUNT_PK = 'DsT1111111111111111111111111111111111111111' as Address;

const MINT_BURN_EXT = {
    __kind: 'ConfidentialMintBurn',
    confidentialSupply: new Uint8Array(64),
    decryptableSupply: new Uint8Array(36),
    supplyElgamalPubkey: SUPPLY_PK,
    pendingBurn: new Uint8Array(64),
};
const TRANSFER_MINT_EXT = { __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } };
const BURN_AUTHORITY = 'BurnAuth1111111111111111111111111111111111' as Address;
/** `PermissionedBurn` with a set authority — forces the permissioned burn variant. */
const PERMISSIONED_BURN_EXT = {
    __kind: 'PermissionedBurn',
    authority: { __option: 'Some', value: BURN_AUTHORITY },
};
/** `PermissionedBurn` with a cleared authority — the standard variant stays allowed. */
const PERMISSIONED_BURN_EXT_CLEARED = { __kind: 'PermissionedBurn', authority: { __option: 'None' } };
const ACCOUNT_EXT = {
    __kind: 'ConfidentialTransferAccount',
    elgamalPubkey: ACCOUNT_PK,
    availableBalance: new Uint8Array(64),
    decryptableAvailableBalance: new Uint8Array(36),
};

const fakeKeys = { elgamal: { tag: 'elgamal' }, aes: { tag: 'aes' } } as unknown as ConfidentialKeys;

describe('confidential mint (wrapper)', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintDecimals = 6;
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('delegates to the upstream mint helper with mapped args', async () => {
        const plan = await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        expect(plan).toBe(mintPlan);
        expect(mockGetConfidentialMintInstructionPlan).toHaveBeenCalledTimes(1);
        const arg = mockGetConfidentialMintInstructionPlan.mock.calls[0][0] as any;
        expect(arg.token).toBe(DEST_TOKEN);
        expect(arg.mint).toBe(MINT);
        // Decoded accounts forwarded to the upstream helper.
        expect(arg.mintAccount).toEqual(mockMintData().data);
        expect(arg.destinationTokenAccount).toEqual(mockTokenData().data);
        // Amount scaled to raw by the wrapper (2 * 10^6).
        expect(arg.amount).toBe(2_000_000n);
        // Supply keys threaded through as separate ElGamal/AES params.
        expect(arg.supplyElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(arg.supplyAesKey).toBe(fakeKeys.aes);
        expect(arg.auditorElgamalPubkey).toBeUndefined();
    });

    it('forwards an auditor override to the upstream helper', async () => {
        await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
            auditorElgamalPubkey: SUPPLY_PK,
        });
        const arg = mockGetConfidentialMintInstructionPlan.mock.calls[0][0] as any;
        expect(arg.auditorElgamalPubkey).toBe(SUPPLY_PK);
    });

    it('fails fast when the mint lacks the ConfidentialMintBurn extension', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT];
        await expect(
            createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                supplyKeys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialMintBurn/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });

    it('fails fast when the mint lacks the ConfidentialTransferMint extension', async () => {
        mockMintExtensions = [MINT_BURN_EXT];
        await expect(
            createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                supplyKeys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferMint/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });

    it('fails fast when the destination account is not confidential-transfer configured', async () => {
        mockTokenExtensions = [];
        await expect(
            createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                supplyKeys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferAccount/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });
});

describe('confidential burn (wrapper)', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintDecimals = 6;
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('delegates to the upstream burn helper with mapped args', async () => {
        const plan = await createConfidentialBurnInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            tokenAccount: SOURCE_TOKEN,
            authority: AUTHORITY,
            amount: '1',
            keys: fakeKeys,
        });

        expect(plan).toBe(burnPlan);
        expect(mockGetConfidentialBurnInstructionPlan).toHaveBeenCalledTimes(1);
        const arg = mockGetConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
        expect(arg.token).toBe(SOURCE_TOKEN);
        expect(arg.mint).toBe(MINT);
        expect(arg.mintAccount).toEqual(mockMintData().data);
        expect(arg.sourceTokenAccount).toEqual(mockTokenData().data);
        expect(arg.amount).toBe(1_000_000n);
        expect(arg.sourceElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(arg.aesKey).toBe(fakeKeys.aes);
        expect(arg.auditorElgamalPubkey).toBeUndefined();
    });

    it('fails fast when the mint lacks the ConfidentialMintBurn extension', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT];
        await expect(
            createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialMintBurn/);
        expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
    });

    it('fails fast when the mint lacks the ConfidentialTransferMint extension', async () => {
        mockMintExtensions = [MINT_BURN_EXT];
        await expect(
            createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferMint/);
        expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
    });

    it('fails fast when the account is not confidential-transfer configured', async () => {
        mockTokenExtensions = [];
        await expect(
            createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferAccount/);
        expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
    });

    // Token-2022 rejects the standard ConfidentialBurn on a mint whose
    // PermissionedBurn authority is set (TokenError::InvalidInstruction), and
    // allows it again once that authority is cleared. Branch selection therefore
    // has to key off the authority, not the extension's presence.
    describe('PermissionedBurn mints', () => {
        it('uses the permissioned variant, with the burn authority as an extra signer', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];

            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: BURN_AUTHORITY,
            });

            expect(plan).toBe(permissionedBurnPlan);
            expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
            expect(mockGetPermissionedConfidentialBurnInstructionPlan).toHaveBeenCalledTimes(1);
            const arg = mockGetPermissionedConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
            // A bare address becomes a no-op signer for raw-transaction flows.
            expect(arg.permissionedBurnAuthority.address).toBe(BURN_AUTHORITY);
            // The account owner still authors the burn.
            expect(arg.authority.address).toBe(AUTHORITY);
            expect(arg.amount).toBe(1_000_000n);
            expect(arg.sourceElgamalKeypair).toBe(fakeKeys.elgamal);
        });

        it('fails fast, naming the configured authority, when it is not supplied', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];

            await expect(
                createConfidentialBurnInstructionPlan({
                    rpc: rpc as never,
                    payer,
                    mint: MINT,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    amount: '1',
                    keys: fakeKeys,
                }),
            ).rejects.toThrow(new RegExp(`permissioned burn authority \\(${BURN_AUTHORITY}\\)`));
            expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
            expect(mockGetPermissionedConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
        });

        it('uses the standard variant when the burn authority is cleared', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT_CLEARED];

            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            });

            expect(plan).toBe(burnPlan);
            expect(mockGetPermissionedConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
        });

        it('ignores a supplied burn authority on a mint without the extension', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];

            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: BURN_AUTHORITY,
            });

            expect(plan).toBe(burnPlan);
            expect(mockGetPermissionedConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
        });
    });
});

describe('apply confidential pending burn', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const expectApplyInstruction = (instruction: any) => {
        const data = getApplyConfidentialPendingBurnInstructionDataDecoder().decode(instruction.data);
        expect(data.discriminator).toBe(APPLY_CONFIDENTIAL_PENDING_BURN_DISCRIMINATOR);
        expect(data.confidentialMintBurnDiscriminator).toBe(
            APPLY_CONFIDENTIAL_PENDING_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
        );
        const accounts = instruction.accounts.map((a: any) => a.address);
        expect(accounts).toContain(MINT);
        expect(accounts).toContain(AUTHORITY);
    };

    it('returns a single-instruction plan targeting the mint + authority', () => {
        const plan: any = createApplyConfidentialPendingBurnInstructionPlan({ mint: MINT, authority: AUTHORITY });
        expect(plan.kind).toBe('single');
        expectApplyInstruction(plan.instruction);
        // Without `resyncSupply` the decryptable supply is left to the caller.
        expect(mockGetUpdateDecryptableSupplyInstruction).not.toHaveBeenCalled();
    });

    it('sequences the decryptable-supply re-sync after the apply when resyncSupply is given', () => {
        const plan: any = createApplyConfidentialPendingBurnInstructionPlan({
            mint: MINT,
            authority: AUTHORITY,
            resyncSupply: { supplyKeys: fakeKeys, rawSupply: 250n },
        });

        expect(plan.kind).toBe('sequential');
        expect(plan.plans).toHaveLength(2);
        // Order matters: re-asserting the decryptable supply before the apply
        // would be overwritten by it.
        expectApplyInstruction(plan.plans[0].instruction);
        expect(plan.plans[1].instruction).toBe(updateDecryptableSupplyIx);
    });

    it('forwards the mint, authority, supply AES key and raw supply to the re-sync helper', () => {
        createApplyConfidentialPendingBurnInstructionPlan({
            mint: MINT,
            authority: AUTHORITY,
            resyncSupply: { supplyKeys: fakeKeys, rawSupply: 250n },
        });

        expect(mockGetUpdateDecryptableSupplyInstruction).toHaveBeenCalledTimes(1);
        const args: any = mockGetUpdateDecryptableSupplyInstruction.mock.calls[0][0];
        expect(args.mint).toBe(MINT);
        expect(args.authority.address).toBe(AUTHORITY);
        expect(args.supplyAesKey).toBe(fakeKeys.aes);
        expect(args.supply).toBe(250n);
    });

    it('rejects an out-of-range resync supply before building anything', () => {
        expect(() =>
            createApplyConfidentialPendingBurnInstructionPlan({
                mint: MINT,
                authority: AUTHORITY,
                resyncSupply: { supplyKeys: fakeKeys, rawSupply: 2n ** 64n },
            }),
        ).toThrow('rawSupply must be a u64');
    });
});
