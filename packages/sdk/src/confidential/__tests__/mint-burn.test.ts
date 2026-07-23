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
const mockGetConfidentialMintInstructionPlan = jest.fn(async (_input: unknown) => mintPlan);
const mockGetConfidentialBurnInstructionPlan = jest.fn(async (_input: unknown) => burnPlan);
jest.mock('@solana-program/token-2022/confidential', () => ({
    getConfidentialMintInstructionPlan: (input: unknown) => mockGetConfidentialMintInstructionPlan(input),
    getConfidentialBurnInstructionPlan: (input: unknown) => mockGetConfidentialBurnInstructionPlan(input),
}));

let mockMintDecimals = 6;
let mockMintExtensions: unknown[] = [];
let mockTokenExtensions: unknown[] = [];
const mockMintData = () => ({ data: { decimals: mockMintDecimals, extensions: { __option: 'Some', value: mockMintExtensions } } });
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
});

describe('apply confidential pending burn', () => {
    it('returns a single-instruction plan targeting the mint + authority', () => {
        const plan: any = createApplyConfidentialPendingBurnInstructionPlan({ mint: MINT, authority: AUTHORITY });
        expect(plan.kind).toBe('single');
        const data = getApplyConfidentialPendingBurnInstructionDataDecoder().decode(plan.instruction.data);
        expect(data.discriminator).toBe(APPLY_CONFIDENTIAL_PENDING_BURN_DISCRIMINATOR);
        expect(data.confidentialMintBurnDiscriminator).toBe(
            APPLY_CONFIDENTIAL_PENDING_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
        );
        const accounts = plan.instruction.accounts.map((a: any) => a.address);
        expect(accounts).toContain(MINT);
        expect(accounts).toContain(AUTHORITY);
    });
});
