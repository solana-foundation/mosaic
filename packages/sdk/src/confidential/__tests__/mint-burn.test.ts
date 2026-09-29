import type { Address } from '@solana/kit';
import { getAddressEncoder } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils.js';
import type { ConfidentialKeys } from '../keys.js';

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
// The record-backed variants stage the batched range proof in an SPL Record
// account instead of inline in the verify instruction data. Distinct plan
// identities so a test can prove which variant was dispatched to.
const mintWithRecordPlan = { kind: 'sequential' as const, id: 'mint-with-record-plan' };
const burnWithRecordPlan = { kind: 'sequential' as const, id: 'burn-with-record-plan' };
const permissionedBurnWithRecordPlan = { kind: 'sequential' as const, id: 'permissioned-burn-with-record-plan' };
const mockGetConfidentialMintWithRecordInstructionPlan = jest.fn(async (_input: unknown) => mintWithRecordPlan);
const mockGetConfidentialBurnWithRecordInstructionPlan = jest.fn(async (_input: unknown) => burnWithRecordPlan);
const mockGetPermissionedConfidentialBurnWithRecordInstructionPlan = jest.fn(
    async (_input: unknown) => permissionedBurnWithRecordPlan,
);
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
    getConfidentialMintWithRecordInstructionPlan: (input: unknown) =>
        mockGetConfidentialMintWithRecordInstructionPlan(input),
    getConfidentialBurnWithRecordInstructionPlan: (input: unknown) =>
        mockGetConfidentialBurnWithRecordInstructionPlan(input),
    getPermissionedConfidentialBurnWithRecordInstructionPlan: (input: unknown) =>
        mockGetPermissionedConfidentialBurnWithRecordInstructionPlan(input),
    getUpdateConfidentialMintBurnDecryptableSupplyInstructionFromSupply: (input: unknown) =>
        mockGetUpdateDecryptableSupplyInstruction(input),
}));

let mockMintDecimals = 6;
let mockMintExtensions: unknown[] = [];
let mockTokenExtensions: unknown[] = [];
/** The mint the fetched token account belongs to — set per test in `beforeEach`. */
let mockTokenMint: Address;
const mockMintData = () => ({
    data: { decimals: mockMintDecimals, extensions: { __option: 'Some', value: mockMintExtensions } },
});
const mockTokenData = () => ({
    data: { mint: mockTokenMint, extensions: { __option: 'Some', value: mockTokenExtensions } },
});

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
import { createConfidentialMintInstructionPlan } from '../mint.js';
import { createApplyConfidentialPendingBurnInstructionPlan, createConfidentialBurnInstructionPlan } from '../burn.js';

const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;
/** A second mint, to stand in for an account handed over from the wrong mint. */
const OTHER_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' as Address;
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

/** A `ConfidentialKeys` stand-in whose ElGamal pubkey decodes back to `address`. */
const fakeKeysFor = (address: Address, tag: string) => {
    const bytes = new Uint8Array(getAddressEncoder().encode(address));
    return {
        elgamal: { tag: `${tag}-elgamal`, pubkey: () => ({ toBytes: () => bytes, free: jest.fn() }) },
        aes: { tag: `${tag}-aes` },
    } as unknown as ConfidentialKeys;
};

// `assertConfidentialKeysMatchAccount` (burn.ts) compares `elgamal.pubkey().toBytes()`
// against `ACCOUNT_EXT.elgamalPubkey`, so the fake pubkey must decode back to it.
const fakeKeys = fakeKeysFor(ACCOUNT_PK, 'account');
// Supply keys are a *different wallet's* keys now, so they decode to the mint's
// registered `supplyElgamalPubkey` instead — `assertConfidentialKeysMatchSupply`
// (mint.ts) checks exactly that.
const fakeSupplyKeys = fakeKeysFor(SUPPLY_PK, 'supply');

describe('confidential mint (wrapper)', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintDecimals = 6;
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        mockTokenMint = MINT;
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
            supplyKeys: fakeSupplyKeys,
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
        expect(arg.supplyElgamalKeypair).toBe(fakeSupplyKeys.elgamal);
        expect(arg.supplyAesKey).toBe(fakeSupplyKeys.aes);
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
            supplyKeys: fakeSupplyKeys,
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
                supplyKeys: fakeSupplyKeys,
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
                supplyKeys: fakeSupplyKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferMint/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });

    // The plan is multi-transaction: proof setup funds three context-state
    // accounts before the mint instruction lands, so a mismatch caught only
    // on-chain would strand their rent with no cleanup transaction.
    it('fails fast when the destination account belongs to a different mint', async () => {
        mockTokenMint = OTHER_MINT;
        await expect(
            createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                supplyKeys: fakeSupplyKeys,
            }),
        ).rejects.toThrow(/belongs to mint/);
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
                supplyKeys: fakeSupplyKeys,
            }),
        ).rejects.toThrow(/ConfidentialTransferAccount/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });

    // Supply keys belong to a dedicated supply-authority wallet and cannot be
    // re-derived from the mint, so presenting another wallet's keys is the likely
    // slip. Caught here rather than as an on-chain proof rejection upstream.
    it("rejects supply keys that are not the mint's registered supply keys", async () => {
        await expect(
            createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                // The account holder's keys, not the supply authority's.
                supplyKeys: fakeKeys,
            }),
        ).rejects.toThrow(/registered supply key/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });

    // The inline range proof leaves the verify transaction too close to the size
    // limit to fit a compute-unit-limit instruction, so callers sending through an
    // executor that sets CU limits must be able to opt into the record-backed form.
    describe('recordBackedProof', () => {
        it('uses the inline variant when the option is omitted', async () => {
            const plan = await createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                supplyKeys: fakeSupplyKeys,
            });
            expect(plan).toBe(mintPlan);
            expect(mockGetConfidentialMintWithRecordInstructionPlan).not.toHaveBeenCalled();
        });

        it('dispatches to the record-backed variant when the option is present', async () => {
            const plan = await createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                supplyKeys: fakeSupplyKeys,
                recordBackedProof: {},
            });
            expect(plan).toBe(mintWithRecordPlan);
            expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
            // An empty option object must not fabricate record args; upstream
            // defaults them (record payer -> payer, authority -> ephemeral signer).
            expect(mockGetConfidentialMintWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordPayer: undefined,
                    recordAuthority: undefined,
                    recordRentReceiver: undefined,
                }),
            );
        });

        it('forwards the record payer, authority and rent receiver', async () => {
            const recordPayer = createMockSigner('RecPayer111111111111111111111111111111111');
            const recordAuthority = createMockSigner('RecAuth11111111111111111111111111111111111');
            await createConfidentialMintInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                supplyKeys: fakeSupplyKeys,
                recordBackedProof: { payer: recordPayer, authority: recordAuthority, rentReceiver: AUTHORITY },
            });
            expect(mockGetConfidentialMintWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordPayer,
                    recordAuthority,
                    recordRentReceiver: AUTHORITY,
                    // The ordinary mint args must survive the record dispatch.
                    mint: MINT,
                    token: DEST_TOKEN,
                    amount: 1_000_000n,
                    supplyElgamalKeypair: fakeSupplyKeys.elgamal,
                }),
            );
        });
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
        mockTokenMint = MINT;
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

    it('fails fast when the account belongs to a different mint', async () => {
        mockTokenMint = OTHER_MINT;
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
        ).rejects.toThrow(/belongs to mint/);
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

        it('reuses one signer for both slots on a self-burn (owner is the burn authority)', async () => {
            // Owner == configured burn authority, supplied in the two different
            // accepted forms. Kit refuses to sign a transaction pairing a real
            // signer with a noop signer for one address, so the builder must
            // collapse them onto the real signer.
            const ownerSigner = createMockSigner(BURN_AUTHORITY);
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];

            await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: ownerSigner,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: BURN_AUTHORITY,
            });

            const arg = mockGetPermissionedConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
            expect(arg.authority).toBe(ownerSigner);
            expect(arg.permissionedBurnAuthority).toBe(ownerSigner);
        });

        it('keeps the real signer when only the burn authority is supplied as one', async () => {
            const burnAuthoritySigner = createMockSigner(BURN_AUTHORITY);
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];

            await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: BURN_AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: burnAuthoritySigner,
            });

            const arg = mockGetPermissionedConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
            expect(arg.authority).toBe(burnAuthoritySigner);
            expect(arg.permissionedBurnAuthority).toBe(burnAuthoritySigner);
        });

        it('keeps two distinct signers when the owner is not the burn authority', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];

            await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: BURN_AUTHORITY,
            });

            const arg = mockGetPermissionedConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
            expect(arg.authority.address).toBe(AUTHORITY);
            expect(arg.permissionedBurnAuthority.address).toBe(BURN_AUTHORITY);
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

    // The record-backed option has to survive branch selection: the standard, the
    // permissioned and the collapsed self-burn paths must each dispatch to their
    // own record-backed variant rather than silently falling back to inline.
    describe('recordBackedProof', () => {
        it('uses the inline variant when the option is omitted', async () => {
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
            expect(mockGetConfidentialBurnWithRecordInstructionPlan).not.toHaveBeenCalled();
        });

        it('dispatches the standard burn to its record-backed variant', async () => {
            const recordAuthority = createMockSigner('RecAuth11111111111111111111111111111111111');
            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                keys: fakeKeys,
                recordBackedProof: { authority: recordAuthority },
            });
            expect(plan).toBe(burnWithRecordPlan);
            expect(mockGetConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
            expect(mockGetConfidentialBurnWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordAuthority,
                    mint: MINT,
                    token: SOURCE_TOKEN,
                    amount: 2_000_000n,
                    sourceElgamalKeypair: fakeKeys.elgamal,
                }),
            );
        });

        it('dispatches the permissioned burn to its record-backed variant', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];
            const burnAuthoritySigner = createMockSigner(BURN_AUTHORITY);

            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: burnAuthoritySigner,
                recordBackedProof: {},
            });

            expect(plan).toBe(permissionedBurnWithRecordPlan);
            expect(mockGetPermissionedConfidentialBurnInstructionPlan).not.toHaveBeenCalled();
            expect(mockGetPermissionedConfidentialBurnWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({ permissionedBurnAuthority: burnAuthoritySigner }),
            );
        });

        it('keeps the self-burn single-signer collapse on the record-backed path', async () => {
            mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT, PERMISSIONED_BURN_EXT];
            const ownerAndBurnAuthority = createMockSigner(BURN_AUTHORITY);

            const plan = await createConfidentialBurnInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: ownerAndBurnAuthority,
                amount: '1',
                keys: fakeKeys,
                permissionedBurnAuthority: BURN_AUTHORITY,
                recordBackedProof: {},
            });

            expect(plan).toBe(permissionedBurnWithRecordPlan);
            const call = mockGetPermissionedConfidentialBurnWithRecordInstructionPlan.mock.calls[0][0] as {
                authority: unknown;
                permissionedBurnAuthority: unknown;
            };
            // Both slots must hold the *same* signer object, or kit refuses to sign
            // ("Multiple distinct signers were identified for address ...").
            expect(call.authority).toBe(ownerAndBurnAuthority);
            expect(call.permissionedBurnAuthority).toBe(ownerAndBurnAuthority);
        });
    });
});

describe('apply confidential pending burn', () => {
    let rpc: ReturnType<typeof createMockRpc>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintDecimals = 6;
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        rpc = createMockRpc();
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

    it('returns a single-instruction plan targeting the mint + authority', async () => {
        const plan: any = await createApplyConfidentialPendingBurnInstructionPlan({
            rpc: rpc as never,
            mint: MINT,
            authority: AUTHORITY,
        });
        expect(plan.kind).toBe('single');
        expectApplyInstruction(plan.instruction);
        // Without `resyncSupply` the decryptable supply is left to the caller.
        expect(mockGetUpdateDecryptableSupplyInstruction).not.toHaveBeenCalled();
    });

    it('sequences the decryptable-supply re-sync after the apply when resyncSupply is given', async () => {
        const plan: any = await createApplyConfidentialPendingBurnInstructionPlan({
            rpc: rpc as never,
            mint: MINT,
            authority: AUTHORITY,
            resyncSupply: { supplyKeys: fakeSupplyKeys, rawSupply: 250n },
        });

        expect(plan.kind).toBe('sequential');
        expect(plan.plans).toHaveLength(2);
        // Order matters: re-asserting the decryptable supply before the apply
        // would be overwritten by it.
        expectApplyInstruction(plan.plans[0].instruction);
        expect(plan.plans[1].instruction).toBe(updateDecryptableSupplyIx);
    });

    it('forwards the mint, authority, supply AES key and raw supply to the re-sync helper', async () => {
        await createApplyConfidentialPendingBurnInstructionPlan({
            rpc: rpc as never,
            mint: MINT,
            authority: AUTHORITY,
            resyncSupply: { supplyKeys: fakeSupplyKeys, rawSupply: 250n },
        });

        expect(mockGetUpdateDecryptableSupplyInstruction).toHaveBeenCalledTimes(1);
        const args: any = mockGetUpdateDecryptableSupplyInstruction.mock.calls[0][0];
        expect(args.mint).toBe(MINT);
        expect(args.authority.address).toBe(AUTHORITY);
        expect(args.supplyAesKey).toBe(fakeSupplyKeys.aes);
        expect(args.supply).toBe(250n);
    });

    it('rejects an out-of-range resync supply before building anything', async () => {
        await expect(
            createApplyConfidentialPendingBurnInstructionPlan({
                rpc: rpc as never,
                mint: MINT,
                authority: AUTHORITY,
                resyncSupply: { supplyKeys: fakeSupplyKeys, rawSupply: 2n ** 64n },
            }),
        ).rejects.toThrow('rawSupply must be a u64');
    });

    it("rejects resync supply keys that are not the mint's registered supply keys", async () => {
        // A holder's account keys passed where the supply authority's are expected:
        // the program would happily re-encrypt under them, breaking every later
        // confidential mint with an opaque on-chain proof rejection.
        await expect(
            createApplyConfidentialPendingBurnInstructionPlan({
                rpc: rpc as never,
                mint: MINT,
                authority: AUTHORITY,
                resyncSupply: { supplyKeys: fakeKeys, rawSupply: 250n },
            }),
        ).rejects.toThrow('does not match mint');
        expect(mockGetUpdateDecryptableSupplyInstruction).not.toHaveBeenCalled();
    });

    it('rejects a mint without the ConfidentialMintBurn extension', async () => {
        mockMintExtensions = [TRANSFER_MINT_EXT];
        await expect(
            createApplyConfidentialPendingBurnInstructionPlan({
                rpc: rpc as never,
                mint: MINT,
                authority: AUTHORITY,
            }),
        ).rejects.toThrow('not configured for confidential mint/burn');
    });
});
