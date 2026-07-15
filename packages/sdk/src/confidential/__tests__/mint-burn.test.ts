import type { Address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import type { ConfidentialKeys } from '../keys';

// --- Mocks --------------------------------------------------------------------
// The confidential mint/burn proof orchestration now lives upstream in
// `@solana-program/token-2022/confidential`. These tests assert the Mosaic
// *wrapper* contract — prerequisite guards, the decryptable-balance drift guard,
// and correct argument mapping into the upstream helpers — so we mock those
// helpers to capture their inputs, and stub the RPC fetches + WASM crypto.

const mockGetConfidentialMintInstructionPlan = jest.fn(async (_input: unknown) => ({ kind: 'sequential' as const }));
const mockGetConfidentialBurnInstructionPlan = jest.fn(async (_input: unknown) => ({ kind: 'sequential' as const }));
jest.mock('@solana-program/token-2022/confidential', () => ({
    getConfidentialMintInstructionPlan: (input: unknown) => mockGetConfidentialMintInstructionPlan(input),
    getConfidentialBurnInstructionPlan: (input: unknown) => mockGetConfidentialBurnInstructionPlan(input),
}));

let mockMintExtensions: unknown[] = [];
let mockTokenExtensions: unknown[] = [];

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(async () => ({
        data: { decimals: 6, extensions: { __option: 'Some', value: mockMintExtensions } },
    })),
    fetchToken: jest.fn(async () => ({
        data: { extensions: { __option: 'Some', value: mockTokenExtensions } },
    })),
}));

// The AES/ElGamal supply-consistency guard. Defaults to "in sync" (true) so the
// delegation tests exercise the happy path; individual tests flip it to false to
// assert the fail-fast behaviour. `decryptAesBalance` is stubbed (no WASM).
const mockElGamalCiphertextEncrypts = jest.fn((): boolean => true);
jest.mock('../keys', () => ({
    decryptAesBalance: jest.fn(() => 1000n),
    elGamalCiphertextEncrypts: () => mockElGamalCiphertextEncrypts(),
}));

import {
    APPLY_CONFIDENTIAL_PENDING_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    APPLY_CONFIDENTIAL_PENDING_BURN_DISCRIMINATOR,
    getApplyConfidentialPendingBurnInstructionDataDecoder,
} from '@solana-program/token-2022';
import {
    createApplyConfidentialPendingBurnInstructionPlan,
    createConfidentialBurnInstructionPlan,
    createConfidentialMintInstructionPlan,
} from '../index';

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
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('delegates to getConfidentialMintInstructionPlan with mapped args', async () => {
        await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        expect(mockGetConfidentialMintInstructionPlan).toHaveBeenCalledTimes(1);
        const arg = mockGetConfidentialMintInstructionPlan.mock.calls[0][0] as any;
        expect(arg.proofMode).toBe('context-state');
        expect(arg.token).toBe(DEST_TOKEN);
        expect(arg.mint).toBe(MINT);
        // Amount is scaled to raw by the wrapper (2 * 10^6).
        expect(arg.amount).toBe(2_000_000n);
        // Destination ElGamal pubkey read from the destination account extension.
        expect(arg.destinationElgamalPubkey).toBe(ACCOUNT_PK);
        // Supply keys threaded through; auditor left to upstream resolution.
        expect(arg.supplyElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(arg.supplyAesKey).toBe(fakeKeys.aes);
        expect(arg.auditorElgamalPubkey).toBeUndefined();
        // Bare address authority becomes a signer whose address is preserved.
        expect(arg.authority.address).toBe(AUTHORITY);
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

    it('fails fast when the decryptable supply is out of sync with the ElGamal ciphertext', async () => {
        mockElGamalCiphertextEncrypts.mockReturnValueOnce(false);
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
        ).rejects.toThrow(/out of sync/);
        expect(mockGetConfidentialMintInstructionPlan).not.toHaveBeenCalled();
    });
});

describe('confidential burn (wrapper)', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('delegates to getConfidentialBurnInstructionPlan with mapped args', async () => {
        await createConfidentialBurnInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            tokenAccount: SOURCE_TOKEN,
            authority: AUTHORITY,
            amount: '1',
            keys: fakeKeys,
        });

        expect(mockGetConfidentialBurnInstructionPlan).toHaveBeenCalledTimes(1);
        const arg = mockGetConfidentialBurnInstructionPlan.mock.calls[0][0] as any;
        expect(arg.proofMode).toBe('context-state');
        expect(arg.token).toBe(SOURCE_TOKEN);
        expect(arg.mint).toBe(MINT);
        expect(arg.amount).toBe(1_000_000n);
        // The decoded source account + mint are threaded through to upstream.
        expect(arg.sourceTokenAccount).toEqual({ extensions: { __option: 'Some', value: mockTokenExtensions } });
        expect(arg.mintAccount).toEqual({
            decimals: 6,
            extensions: { __option: 'Some', value: mockMintExtensions },
        });
        expect(arg.sourceElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(arg.aesKey).toBe(fakeKeys.aes);
        expect(arg.authority.address).toBe(AUTHORITY);
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

    it('fails fast when the decryptable balance is out of sync with the ElGamal ciphertext', async () => {
        mockElGamalCiphertextEncrypts.mockReturnValueOnce(false);
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
        ).rejects.toThrow(/out of sync/);
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
