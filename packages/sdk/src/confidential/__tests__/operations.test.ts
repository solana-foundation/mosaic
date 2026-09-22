import type {
    Address,
    Rpc,
    SimulateTransactionApi,
    TransactionMessage,
    TransactionMessageWithFeePayer,
} from '@solana/kit';
import {
    blockhash,
    flattenTransactionPlan,
    generateKeyPairSigner,
    getAddressEncoder,
    parallelInstructionPlan,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { createMockRpc, createMockSigner, seedMintDetails } from '../../__tests__/test-utils.js';
import type { ConfidentialKeys } from '../keys.js';

// --- Mocks --------------------------------------------------------------------
// Keep the real instruction encoders (pure codecs) but stub the upstream
// instruction-plan helpers and the RPC fetch/decode helpers so the wrappers can
// be asserted without WASM proofs or a live cluster.
const mockConfigurePlan = { kind: 'configurePlan' } as const;
const mockWithdrawPlan = { kind: 'withdrawPlan' } as const;
const mockTransferPlan = { kind: 'transferPlan' } as const;
const mockApplyIx = { tag: 'applyIx' } as const;
const mockEmptyPlan = { kind: 'emptyPlan' } as const;
// Record-backed variants stage the batched range proof in an SPL Record account
// rather than inline; distinct identities so dispatch can be asserted.
const mockWithdrawWithRecordPlan = { kind: 'withdrawWithRecordPlan' } as const;
const mockTransferWithRecordPlan = { kind: 'transferWithRecordPlan' } as const;
// Matches `fakeKeys.elgamal.pubkey()` below, so builders' new
// `assertConfidentialKeysMatchAccount` check passes for the source account.
const SOURCE_ELGAMAL_PUBKEY = 'DsT1111111111111111111111111111111111111111' as Address;
const mockSourceToken = {
    data: {
        kind: 'sourceTokenData',
        extensions: {
            __option: 'Some',
            value: [{ __kind: 'ConfidentialTransferAccount', elgamalPubkey: SOURCE_ELGAMAL_PUBKEY }],
        },
    },
};
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
    getEmptyConfidentialTransferAccountInstructionPlan: jest.fn(async () => mockEmptyPlan),
    getConfidentialWithdrawWithRecordInstructionPlan: jest.fn(async () => mockWithdrawWithRecordPlan),
    getConfidentialTransferWithRecordInstructionPlan: jest.fn(async () => mockTransferWithRecordPlan),
}));

import { getConfidentialDepositInstructionDataDecoder, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    getApplyConfidentialPendingBalanceInstructionFromToken,
    getConfidentialTransferInstructionPlan,
    getConfidentialWithdrawInstructionPlan,
    getConfidentialTransferWithRecordInstructionPlan,
    getConfidentialWithdrawWithRecordInstructionPlan,
    getCreateConfidentialTransferAccountInstructionPlan,
    getEmptyConfidentialTransferAccountInstructionPlan,
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
    createConfidentialTransactionPlanner,
    estimateAndSetConfidentialResourceLimits,
    planConfidentialInstructions,
} from '../index.js';

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
const fakeElgamalPubkeyBytes = new Uint8Array(getAddressEncoder().encode(SOURCE_ELGAMAL_PUBKEY));
const fakeKeys = {
    elgamal: {
        secret: () => fakeElgamalSecret,
        pubkey: () => ({ toBytes: () => fakeElgamalPubkeyBytes, free: jest.fn() }),
    },
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
        it('passes the decoded token account, decimals, and the raw amount', async () => {
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
                    amount: 2_000_000n,
                    decimals: 6,
                    tokenAccount: mockSourceToken.data,
                }),
            );
        });
    });

    // Token-2022's process_deposit and process_withdraw both reject a mint
    // carrying ConfidentialMintBurn with IllegalMintBurnConversion: such a mint's
    // supply exists only as an encrypted value, so there is no plaintext side to
    // convert to or from. Both builders must fail fast instead of emitting a
    // transaction the chain is guaranteed to reject.
    describe('plaintext conversions on a ConfidentialMintBurn mint', () => {
        beforeEach(() => {
            seedMintDetails(rpc, {
                address: MINT,
                decimals: 6,
                extensions: [{ extension: 'confidentialTransferMint' }, { extension: 'confidentialMintBurn' }],
            });
        });

        it('deposit fails fast and builds no instruction', async () => {
            await expect(
                createConfidentialDepositInstructionPlan({
                    rpc,
                    mint: MINT,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    amount: '1',
                }),
            ).rejects.toThrow(/ConfidentialMintBurn extension enabled; confidential deposit is not supported/);
        });

        it('withdraw fails fast without calling the upstream helper', async () => {
            await expect(
                createConfidentialWithdrawInstructionPlan({
                    rpc: rpc as never,
                    payer,
                    mint: MINT,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    amount: '1',
                    keys: fakeKeys,
                }),
            ).rejects.toThrow(/ConfidentialMintBurn extension enabled; confidential withdrawal is not supported/);
            expect(getConfidentialWithdrawInstructionPlan).not.toHaveBeenCalled();
        });

        it('points the caller at the confidential mint/burn path', async () => {
            await expect(
                createConfidentialDepositInstructionPlan({
                    rpc,
                    mint: MINT,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    amount: '1',
                }),
            ).rejects.toThrow(/createConfidentialMintInstructionPlan \/ createConfidentialBurnInstructionPlan/);
        });

        it('still allows a confidential transfer (not a plaintext conversion)', async () => {
            const plan = await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            });
            expect(plan).toBe(mockTransferPlan);
        });
    });

    describe('transfer', () => {
        it('passes source/destination accounts, raw amount, and the resolved auditor', async () => {
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
                    amount: 3_000_000n,
                    mintAccount: { decimals: 6, extensions: mockMintExtensions },
                    sourceTokenAccount: mockSourceToken.data,
                    destinationTokenAccount: mockDestToken.data,
                    auditorElgamalPubkey: undefined,
                }),
            );
        });

        it('forwards the decoded mint so the helper resolves the auditor', async () => {
            // Auditor resolution lives in the upstream helper (token-2022 #1269);
            // mosaic just forwards the decoded mint as `mintAccount` and leaves
            // `auditorElgamalPubkey` undefined so the helper reads it from there.
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
                expect.objectContaining({
                    mintAccount: { decimals: 6, extensions: mockMintExtensions },
                    auditorElgamalPubkey: undefined,
                }),
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
        // Since token-2022 0.18.0 this delegates to the upstream plan helper
        // instead of hand-wiring a sibling ZeroCiphertext proof, so the assertion
        // is on the arguments handed over rather than on the emitted instructions.
        it('delegates to the upstream empty-account plan with the decoded account and ElGamal keypair', async () => {
            const plan = await createEmptyConfidentialAccountInstructionPlan({
                rpc: rpc as never,
                payer,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                keys: fakeKeys,
            });
            expect(plan).toBe(mockEmptyPlan);
            expect(getEmptyConfidentialTransferAccountInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    payer,
                    token: SOURCE_TOKEN,
                    tokenAccount: mockSourceToken.data,
                    elgamalKeypair: fakeKeys.elgamal,
                }),
            );
            // The authority is normalized to a signer (a bare address becomes a noop signer).
            const call = (getEmptyConfidentialTransferAccountInstructionPlan as jest.Mock).mock.calls[0][0];
            expect(call.authority.address).toBe(AUTHORITY);
        });

        it('fails fast when the account is not configured for confidential transfers', async () => {
            mockTokenByAddr[SOURCE_TOKEN] = { data: { kind: 'plainAta', extensions: { __option: 'None' } } };
            await expect(
                createEmptyConfidentialAccountInstructionPlan({
                    rpc: rpc as never,
                    payer,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    keys: fakeKeys,
                }),
            ).rejects.toThrow(/not configured for confidential transfers/);
            expect(getEmptyConfidentialTransferAccountInstructionPlan).not.toHaveBeenCalled();
        });

        it('rejects keys that are not the ones the account was configured with', async () => {
            mockTokenByAddr[SOURCE_TOKEN] = {
                data: {
                    kind: 'sourceTokenData',
                    extensions: {
                        __option: 'Some',
                        value: [
                            {
                                __kind: 'ConfidentialTransferAccount',
                                elgamalPubkey: 'Dsu111111111111111111111111111111111111111' as Address,
                            },
                        ],
                    },
                },
            };
            await expect(
                createEmptyConfidentialAccountInstructionPlan({
                    rpc: rpc as never,
                    payer,
                    tokenAccount: SOURCE_TOKEN,
                    authority: AUTHORITY,
                    keys: fakeKeys,
                }),
            ).rejects.toThrow();
            expect(getEmptyConfidentialTransferAccountInstructionPlan).not.toHaveBeenCalled();
        });
    });

    // Same opt-in as mint/burn: needed whenever an executor sets compute-unit
    // limits, since the inline range proof leaves no room for that instruction.
    describe('recordBackedProof', () => {
        it('routes withdraw to the record-backed variant only when asked', async () => {
            const inline = await createConfidentialWithdrawInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            });
            expect(inline).toBe(mockWithdrawPlan);
            expect(getConfidentialWithdrawWithRecordInstructionPlan).not.toHaveBeenCalled();

            const withRecord = await createConfidentialWithdrawInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                tokenAccount: SOURCE_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                recordBackedProof: { rentReceiver: AUTHORITY },
            });
            expect(withRecord).toBe(mockWithdrawWithRecordPlan);
            expect(getConfidentialWithdrawWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({ recordRentReceiver: AUTHORITY, token: SOURCE_TOKEN }),
            );
        });

        it('routes transfer to the record-backed variant only when asked', async () => {
            const inline = await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
            });
            expect(inline).toBe(mockTransferPlan);
            expect(getConfidentialTransferWithRecordInstructionPlan).not.toHaveBeenCalled();

            const withRecord = await createConfidentialTransferInstructionPlan({
                rpc: rpc as never,
                payer,
                mint: MINT,
                sourceToken: SOURCE_TOKEN,
                destinationToken: DEST_TOKEN,
                authority: AUTHORITY,
                amount: '1',
                keys: fakeKeys,
                recordBackedProof: {},
            });
            expect(withRecord).toBe(mockTransferWithRecordPlan);
            expect(getConfidentialTransferWithRecordInstructionPlan).toHaveBeenCalledWith(
                expect.objectContaining({ sourceToken: SOURCE_TOKEN, destinationToken: DEST_TOKEN }),
            );
        });
    });

    describe('planConfidentialInstructions', () => {
        it('packs a single-instruction plan into one fee-payer-bound version-0 transaction', async () => {
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
            // Default stays version 0, with no resource limits written — the
            // runtime's 200k-CU-per-instruction fallback still applies there.
            expect(txPlan.message.version).toBe(0);
            expect(txPlan.message.config).toBeUndefined();
        });

        it('packs version-1 messages with provisory resource limits when asked', async () => {
            const feePayer = await generateKeyPairSigner();
            const owner = await generateKeyPairSigner();
            const instructionPlan = createEnableConfidentialCreditsInstructionPlan({
                tokenAccount: SOURCE_TOKEN,
                authority: owner,
            });
            const txPlan: any = await planConfidentialInstructions({ instructionPlan, feePayer, version: 1 });
            expect(txPlan.kind).toBe('single');
            expect(txPlan.message.version).toBe(1);
            // Version 1 defaults both limits to zero on chain, so the fields must
            // be present (at kit's provisory value) for the send path to replace.
            expect(txPlan.message.config).toEqual({ computeUnitLimit: 0, loadedAccountsDataSizeLimit: 0 });
        });

        it('fits more instructions per transaction at version 1 than at version 0', async () => {
            // Synthetic oversized instructions rather than real confidential ones:
            // the upstream plan helpers are mocked here, and what is under test is
            // the packing budget (1232 vs 4096 bytes), not the proof shapes.
            const feePayer = await generateKeyPairSigner();
            const program = (await generateKeyPairSigner()).address;
            const bigInstruction = (fill: number) => ({
                programAddress: program,
                data: new Uint8Array(500).fill(fill),
            });
            const instructionPlan = parallelInstructionPlan([1, 2, 3, 4].map(bigInstruction));

            const v0 = await createConfidentialTransactionPlanner(feePayer)(instructionPlan);
            const v1 = await createConfidentialTransactionPlanner(feePayer, { version: 1 })(instructionPlan);

            expect(flattenTransactionPlan(v0)).toHaveLength(2);
            expect(flattenTransactionPlan(v1)).toHaveLength(1);
        });
    });

    describe('estimateAndSetConfidentialResourceLimits', () => {
        const LIFETIME = {
            blockhash: blockhash('11111111111111111111111111111111'),
            lastValidBlockHeight: 100n,
        };

        /** Minimal `simulateTransaction`-only RPC returning a fixed simulation result. */
        function mockSimulationRpc(value: Record<string, unknown>): Rpc<SimulateTransactionApi> {
            return {
                simulateTransaction: jest.fn(() => ({ send: jest.fn(async () => ({ value })) })),
            } as unknown as Rpc<SimulateTransactionApi>;
        }

        async function planOne(version: 0 | 1): Promise<TransactionMessage & TransactionMessageWithFeePayer> {
            const feePayer = await generateKeyPairSigner();
            const owner = await generateKeyPairSigner();
            const txPlan: any = await planConfidentialInstructions({
                instructionPlan: createEnableConfidentialCreditsInstructionPlan({
                    tokenAccount: SOURCE_TOKEN,
                    authority: owner,
                }),
                feePayer,
                version,
            });
            return txPlan.message;
        }

        it('rejects a planned message that has no lifetime yet', async () => {
            // Planned messages are deliberately lifetime-free; simulating one
            // would fail deep inside kit's compile step instead.
            await expect(
                estimateAndSetConfidentialResourceLimits({
                    rpc: mockSimulationRpc({ err: null, unitsConsumed: 1n }),
                    transactionMessage: await planOne(1),
                }),
            ).rejects.toThrow(/without a lifetime/);
        });

        it('replaces version-1 provisory limits with the simulated values', async () => {
            const message = setTransactionMessageLifetimeUsingBlockhash(LIFETIME, await planOne(1));
            const updated: any = await estimateAndSetConfidentialResourceLimits({
                rpc: mockSimulationRpc({ err: null, unitsConsumed: 123_456n, loadedAccountsDataSize: 65_536 }),
                transactionMessage: message,
            });
            expect(updated.config).toEqual({ computeUnitLimit: 123_456, loadedAccountsDataSizeLimit: 65_536 });
        });

        it('throws for version 1 when the RPC omits the loaded-accounts data size', async () => {
            // Version 1 cannot be sent without this limit, so a silent fallback
            // would only surface as MaxLoadedAccountsDataSizeExceeded on chain.
            const message = setTransactionMessageLifetimeUsingBlockhash(LIFETIME, await planOne(1));
            await expect(
                estimateAndSetConfidentialResourceLimits({
                    rpc: mockSimulationRpc({ err: null, unitsConsumed: 123_456n }),
                    transactionMessage: message,
                }),
            ).rejects.toThrow();
        });

        it('sets only a compute-unit-limit instruction on version-0 messages', async () => {
            const message = setTransactionMessageLifetimeUsingBlockhash(LIFETIME, await planOne(0));
            const updated: any = await estimateAndSetConfidentialResourceLimits({
                rpc: mockSimulationRpc({ err: null, unitsConsumed: 99_000n }),
                transactionMessage: message,
            });
            expect(updated.config).toBeUndefined();
            // The added ComputeBudget instruction is what makes `recordBackedProof`
            // necessary at version 0: it grows an already size-critical message.
            expect(updated.instructions.length).toBe(message.instructions.length + 1);
        });
    });
});
