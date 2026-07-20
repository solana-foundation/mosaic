import type { Address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import type { ConfidentialKeys } from '../keys';

// --- Mocks --------------------------------------------------------------------
// No published token-2022 ships confidential mint/burn `InstructionPlan` helpers,
// so the proof generation + context-state assembly are implemented locally
// (`mint-burn-proof.ts` + `mint-burn-util.ts`, exercised for real by
// `ciphertext-math.test.ts` / `mint-burn-proof.test.ts`). These tests assert the
// Mosaic *wrapper* contract — prerequisite guards, the decryptable-balance drift
// guard, and correct argument mapping into the local proof builder + assembler —
// so we mock the proof builder, the drift guard, and the plan assembler, and stub
// the RPC fetches.

const fakeProof = {
    equalityProofBytes: new Uint8Array(1),
    ciphertextValidityProofBytes: new Uint8Array(1),
    rangeProofBytes: new Uint8Array(1),
    auditorCiphertextLo: new Uint8Array(64),
    auditorCiphertextHi: new Uint8Array(64),
    newDecryptableBalance: new Uint8Array(36),
};
const mockBuildMintProofData = jest.fn((_input: unknown) => fakeProof);
const mockBuildBurnProofData = jest.fn((_input: unknown) => fakeProof);
// The AES/ElGamal supply-consistency guard. Defaults to "in sync" (true) so the
// delegation tests exercise the happy path; individual tests flip it to false.
const mockElGamalCiphertextEncrypts = jest.fn((): boolean => true);
jest.mock('../mint-burn-proof', () => ({
    buildMintProofData: (input: unknown) => mockBuildMintProofData(input as never),
    buildBurnProofData: (input: unknown) => mockBuildBurnProofData(input as never),
    elGamalCiphertextEncrypts: () => mockElGamalCiphertextEncrypts(),
}));

// Capture the assembler input (incl. the built token instruction) but skip the
// real context-state proof wiring (no WASM / proof-program calls in unit tests).
const mockAssembleConfidentialMintBurnPlan = jest.fn(async (_input: unknown) => ({ kind: 'sequential' as const }));
jest.mock('../mint-burn-util', () => ({
    ...jest.requireActual('../mint-burn-util'),
    assembleConfidentialMintBurnPlan: (input: unknown) => mockAssembleConfidentialMintBurnPlan(input),
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

// `decryptAesBalance` is stubbed (no WASM); returns the current supply/balance.
jest.mock('../keys', () => ({
    decryptAesBalance: jest.fn(() => 1000n),
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
        mockElGamalCiphertextEncrypts.mockReturnValue(true);
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('builds the mint proof and assembles a context-state plan with mapped args', async () => {
        await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        expect(mockBuildMintProofData).toHaveBeenCalledTimes(1);
        const proofArg = mockBuildMintProofData.mock.calls[0][0] as any;
        // Amount is scaled to raw by the wrapper (2 * 10^6).
        expect(proofArg.mintAmount).toBe(2_000_000n);
        // Current supply decrypted from the mint's decryptable supply (stub → 1000n).
        expect(proofArg.currentSupply).toBe(1000n);
        // Destination ElGamal pubkey read from the destination account extension.
        expect(proofArg.destinationElgamalPubkey).toBe(ACCOUNT_PK);
        // Supply keys threaded through; no auditor configured on the mint.
        expect(proofArg.supplyElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(proofArg.supplyAesKey).toBe(fakeKeys.aes);
        expect(proofArg.auditorElgamalPubkey).toBeUndefined();

        expect(mockAssembleConfidentialMintBurnPlan).toHaveBeenCalledTimes(1);
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
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
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
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
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
        expect(mockBuildMintProofData).not.toHaveBeenCalled();
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
    });
});

describe('confidential burn (wrapper)', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockElGamalCiphertextEncrypts.mockReturnValue(true);
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        mockTokenExtensions = [ACCOUNT_EXT];
        rpc = createMockRpc();
    });

    it('builds the burn proof and assembles a context-state plan with mapped args', async () => {
        await createConfidentialBurnInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            tokenAccount: SOURCE_TOKEN,
            authority: AUTHORITY,
            amount: '1',
            keys: fakeKeys,
        });

        expect(mockBuildBurnProofData).toHaveBeenCalledTimes(1);
        const proofArg = mockBuildBurnProofData.mock.calls[0][0] as any;
        expect(proofArg.burnAmount).toBe(1_000_000n);
        expect(proofArg.currentAvailableBalance).toBe(1000n);
        // Supply pubkey read from the mint's ConfidentialMintBurn extension.
        expect(proofArg.supplyElgamalPubkey).toBe(SUPPLY_PK);
        expect(proofArg.sourceElgamalKeypair).toBe(fakeKeys.elgamal);
        expect(proofArg.sourceAesKey).toBe(fakeKeys.aes);
        expect(proofArg.auditorElgamalPubkey).toBeUndefined();

        expect(mockAssembleConfidentialMintBurnPlan).toHaveBeenCalledTimes(1);
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
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
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
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
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
        expect(mockBuildBurnProofData).not.toHaveBeenCalled();
        expect(mockAssembleConfidentialMintBurnPlan).not.toHaveBeenCalled();
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
