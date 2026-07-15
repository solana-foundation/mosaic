import type { Address } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import { createMockRpc, createMockSigner, seedMintDetails } from '../../__tests__/test-utils';
import type { ConfidentialKeys } from '../keys';

// --- Mocks --------------------------------------------------------------------
// Keep the real instruction encoders (pure codecs) but stub the upstream
// instruction-plan helpers and the RPC fetch/decode helpers so the wrappers can
// be asserted without WASM proofs or a live cluster.
const mockConfigurePlan = { kind: 'configurePlan' } as const;
const mockWithdrawPlan = { kind: 'withdrawPlan' } as const;
const mockTransferPlan = { kind: 'transferPlan' } as const;
const mockApplyIx = { tag: 'applyIx' } as const;
const mockSourceToken = { data: { kind: 'sourceTokenData' } };
const mockDestToken = {
    data: {
        kind: 'destTokenData',
        // Destination must carry the ConfidentialTransferAccount extension or the
        // transfer builder fails fast.
        extensions: { __option: 'Some', value: [{ __kind: 'ConfidentialTransferAccount' }] },
    },
};
const mockTokenByAddr: Record<string, unknown> = {};
let mockMintExtensions: { __option: 'None' } | { __option: 'Some'; value: unknown[] } = { __option: 'None' };

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchToken: jest.fn(async (_rpc: unknown, addr: string) => mockTokenByAddr[addr]),
    fetchMint: jest.fn(async () => ({ data: { decimals: 6, extensions: mockMintExtensions } })),
}));

// The InstructionPlan/derive helpers live on the `/confidential` subpath (moved
// off the root barrel in token-2022 0.11+); stub them there.
jest.mock('@solana-program/token-2022/confidential', () => ({
    getCreateConfidentialTransferAccountInstructionPlan: jest.fn(async () => mockConfigurePlan),
    getConfidentialWithdrawInstructionPlan: jest.fn(async () => mockWithdrawPlan),
    getConfidentialTransferInstructionPlan: jest.fn(async () => mockTransferPlan),
    getApplyConfidentialPendingBalanceInstructionFromToken: jest.fn(() => mockApplyIx),
}));

// Mock the bespoke proof + account-state plumbing used by empty-account.
jest.mock('../proof', () => ({
    buildZeroCiphertextProofIxs: jest.fn(async () => ({ setup: [{ tag: 'verifyZero' }], cleanup: [] })),
}));
jest.mock('../account-state', () => ({
    fetchConfidentialAccountState: jest.fn(async () => ({
        ciphertexts: { availableBalance: new Uint8Array(64) },
    })),
}));

import {
    getConfidentialDepositInstructionDataDecoder,
    getEmptyConfidentialTransferAccountInstructionDataDecoder,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import {
    getApplyConfidentialPendingBalanceInstructionFromToken,
    getConfidentialTransferInstructionPlan,
    getConfidentialWithdrawInstructionPlan,
    getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential';
import {
    createApplyConfidentialPendingBalanceInstructionPlan,
    createApproveConfidentialAccountInstructionPlan,
    createConfidentialDepositInstructionPlan,
    createConfidentialTransferInstructionPlan,
    createConfidentialWithdrawInstructionPlan,
    createConfigureConfidentialAccountInstructionPlan,
    createEmptyConfidentialAccountInstructionPlan,
    createEnableConfidentialCreditsInstructionPlan,
    createDisableNonConfidentialCreditsInstructionPlan,
    planConfidentialInstructions,
} from '../index';

const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address;
const SOURCE_TOKEN = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const DEST_TOKEN = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const AUTHORITY = 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;
const AUDITOR = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;

// A structural stand-in for ConfidentialKeys (the helpers are mocked, so the
// real WASM objects are never used — apply just needs `elgamal.secret()`).
// `secret()` returns a single memoized object so tests can assert its WASM
// `free()` was called (cleared each test via `jest.clearAllMocks()`).
const fakeElgamalSecret = { free: jest.fn() };
const fakeKeys = {
    elgamal: { secret: () => fakeElgamalSecret },
    aes: { tag: 'aes' },
} as unknown as ConfidentialKeys;

describe('confidential operation builders', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        // Default to a valid confidential-transfer mint with no auditor; tests
        // that exercise the auditor path override this.
        mockMintExtensions = {
            __option: 'Some',
            value: [{ __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } }],
        };
        mockTokenByAddr[SOURCE_TOKEN] = mockSourceToken;
        mockTokenByAddr[DEST_TOKEN] = mockDestToken;
        rpc = createMockRpc();
        seedMintDetails(rpc, { address: MINT, decimals: 6 });
    });

    describe('credits', () => {
        it('returns a single-instruction plan targeting the token account + authority', () => {
            const plan: any = createEnableConfidentialCreditsInstructionPlan({
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
            });
            expect(plan.kind).toBe('single');
            expect(plan.instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
            const accounts = plan.instruction.accounts.map((a: any) => a.address);
            expect(accounts).toContain(SOURCE_TOKEN);
            expect(accounts).toContain(AUTHORITY);
        });

        it('disable-non-confidential-credits also yields a single plan', () => {
            const plan: any = createDisableNonConfidentialCreditsInstructionPlan({
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
            });
            expect(plan.kind).toBe('single');
        });
    });

    describe('deposit', () => {
        it('converts a decimal amount to raw using the mint decimals', async () => {
            const plan: any = await createConfidentialDepositInstructionPlan({
                rpc,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1.5',
            });
            expect(plan.kind).toBe('single');
            const data = getConfidentialDepositInstructionDataDecoder().decode(plan.instruction.data);
            expect(data.amount).toBe(1_500_000n); // 1.5 * 10^6
            expect(data.decimals).toBe(6);
        });

        it('treats a bigint amount as already-raw', async () => {
            const plan: any = await createConfidentialDepositInstructionPlan({
                rpc,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: 42n,
            });
            const data = getConfidentialDepositInstructionDataDecoder().decode(plan.instruction.data);
            expect(data.amount).toBe(42n);
        });
    });

    describe('configure-account', () => {
        it('forwards the ElGamal/AES keys to the upstream helper and returns its plan', async () => {
            const plan = await createConfigureConfidentialAccountInstructionPlan({
                rpc: rpc as never,
                payer,
                owner: AUTHORITY,
                mint: MINT,
                keys: fakeKeys,
            });
            expect(plan).toBe(mockConfigurePlan);
            expect(getCreateConfidentialTransferAccountInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    mint: MINT,
                    owner: AUTHORITY,
                    payer,
                    elgamalKeypair: fakeKeys.elgamal,
                    aesKey: fakeKeys.aes,
                }),
            );
        });

        it('approve returns a single plan signed by the authority', () => {
            const plan: any = createApproveConfidentialAccountInstructionPlan({
                tokenAccount: SOURCE_TOKEN,
                mint: MINT,
                authority: payer,
            });
            expect(plan.kind).toBe('single');
            expect(plan.instruction.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        });
    });

    describe('apply-pending-balance', () => {
        it('decodes the token account and passes the ElGamal secret + AES key', async () => {
            const plan: any = await createApplyConfidentialPendingBalanceInstructionPlan({
                rpc: rpc as never,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                keys: fakeKeys,
            });
            expect(plan.kind).toBe('single');
            expect(plan.instruction).toBe(mockApplyIx);
            expect(getApplyConfidentialPendingBalanceInstructionFromToken).toHaveBeenCalledWith(
                expect.objectContaining({
                    token: SOURCE_TOKEN,
                    tokenAccount: mockSourceToken.data,
                    aesKey: fakeKeys.aes,
                }),
            );
            // The `finally` block frees the ElGamal secret's WASM memory.
            expect(fakeElgamalSecret.free).toHaveBeenCalled();
        });
    });

    describe('withdraw', () => {
        it('uses context-state proof mode and the raw amount', async () => {
            const plan = await createConfidentialWithdrawInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '2',
                keys: fakeKeys,
            });
            expect(plan).toBe(mockWithdrawPlan);
            expect(getConfidentialWithdrawInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    proofMode: 'context-state',
                    amount: 2_000_000n,
                    decimals: 6,
                    tokenAccount: mockSourceToken.data,
                }),
            );
        });
    });

    describe('transfer', () => {
        it('passes source/destination accounts, raw amount, and context-state mode', async () => {
            const plan = await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '3',
                keys: fakeKeys,
            });
            expect(plan).toBe(mockTransferPlan);
            expect(getConfidentialTransferInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    proofMode: 'context-state',
                    amount: 3_000_000n,
                    sourceTokenAccount: mockSourceToken.data,
                    destinationTokenAccount: mockDestToken.data,
                    auditorElgamalPubkey: undefined,
                }),
            );
        });

        it('detects the auditor pubkey from the mint extension', async () => {
            mockMintExtensions = {
                __option: 'Some',
                value: [
                    { __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'Some', value: AUDITOR } },
                ],
            };
            await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '3',
                keys: fakeKeys,
            });
            expect(getConfidentialTransferInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({ auditorElgamalPubkey: AUDITOR }),
            );
        });

        it('honors an explicit auditor override', async () => {
            await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '3',
                keys: fakeKeys,
                auditorElgamalPubkey: AUDITOR,
            });
            expect(getConfidentialTransferInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({ auditorElgamalPubkey: AUDITOR }),
            );
        });

        it('fails fast when the destination is not configured for confidential transfers', async () => {
            // A plain ATA with no ConfidentialTransferAccount extension.
            mockTokenByAddr[DEST_TOKEN] = { data: { kind: 'plainAta', extensions: { __option: 'None' } } };
            await expect(
                createConfidentialTransferInstructionPlan({
                    rpc: rpc as never,
                    payer,
                    mint: MINT,
                    sourceToken: SOURCE_TOKEN,
                    destinationToken: DEST_TOKEN,
                    authority: AUTHORITY,
                    amount: '3',
                    keys: fakeKeys,
                }),
            ).rejects.toThrow(/not configured for confidential transfers/);
            expect(getConfidentialTransferInstructionPlan).not.toHaveBeenCalled();
        });
    });

    describe('empty-account', () => {
        it('places the sibling ZeroCiphertext proof immediately before the token ix (offset -1)', async () => {
            const plan: any = await createEmptyConfidentialAccountInstructionPlan({
                rpc: rpc as never,
                payer,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                keys: fakeKeys,
            });
            expect(plan.kind).toBe('sequential');
            expect(plan.divisible).toBe(false);
            // [proof verify ix, empty ix] — sub-plans may be normalized to single-instruction plans.
            const instructions = plan.plans.map((p: any) => p.instruction ?? p);
            expect(instructions[0]).toEqual({ tag: 'verifyZero' });
            // The empty instruction must reference the proof at offset -1 (sibling).
            const emptyIx = instructions[1];
            expect(emptyIx.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
            const emptyData = getEmptyConfidentialTransferAccountInstructionDataDecoder().decode(emptyIx.data);
            expect(emptyData.proofInstructionOffset).toBe(-1);
        });
    });

    describe('planConfidentialInstructions', () => {
        it('packs a single-instruction plan into one fee-payer-bound transaction', async () => {
            // The planner compiles the message to size it, so use real addresses.
            const feePayer = await generateKeyPairSigner();
            const owner = await generateKeyPairSigner();
            const instructionPlan = createEnableConfidentialCreditsInstructionPlan({
                tokenAccount: SOURCE_TOKEN,
                authority: owner,
            });
            const txPlan: any = await planConfidentialInstructions({ instructionPlan, feePayer });
            expect(txPlan.kind).toBe('single');
            expect(txPlan.message.feePayer.address).toBe(feePayer.address);
        });
    });
});
