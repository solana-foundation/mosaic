import type { Address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import type { ConfidentialKeys } from '../keys';
import type { MintBurnProofData } from '../mint-burn-proof';

// --- Mocks --------------------------------------------------------------------
// Keep the real mint/burn instruction encoders + discriminators (pure codecs) so
// we can decode and assert them, but stub the WASM proof-data generation, the
// proof-instruction wiring, the RPC fetches, and the AES supply decryption.

const fakeProof = (): MintBurnProofData => ({
    equalityProofBytes: new Uint8Array([1]),
    ciphertextValidityProofBytes: new Uint8Array([2]),
    rangeProofBytes: new Uint8Array([3]),
    auditorCiphertextLo: new Uint8Array(64).fill(7),
    auditorCiphertextHi: new Uint8Array(64).fill(8),
    newDecryptableBalance: new Uint8Array(36).fill(9),
});

let mockMintExtensions: unknown[] = [];
const mockDestinationToken = {
    data: {
        extensions: {
            __option: 'Some',
            value: [
                { __kind: 'ConfidentialTransferAccount', elgamalPubkey: 'DsT1111111111111111111111111111111111111111' },
            ],
        },
    },
};

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(async () => ({
        data: { decimals: 6, extensions: { __option: 'Some', value: mockMintExtensions } },
    })),
    fetchToken: jest.fn(async () => mockDestinationToken),
}));

const mockBuildMintProofData = jest.fn((_input: unknown): MintBurnProofData => fakeProof());
const mockBuildBurnProofData = jest.fn((_input: unknown): MintBurnProofData => fakeProof());
// The AES/ElGamal supply-consistency guard. Defaults to "in sync" (true) so the
// plan-shape tests exercise the happy path; individual tests flip it to false to
// assert the fail-fast behaviour.
const mockElGamalCiphertextEncrypts = jest.fn((): boolean => true);
jest.mock('../mint-burn-proof', () => ({
    buildMintProofData: (input: unknown) => mockBuildMintProofData(input),
    buildBurnProofData: (input: unknown) => mockBuildBurnProofData(input),
    elGamalCiphertextEncrypts: () => mockElGamalCiphertextEncrypts(),
}));

// Fixed proof-instruction wiring so the plan shape is deterministic and the
// token instruction is easy to locate.
jest.mock('../proof', () => ({
    buildMintBurnProofIxs: jest.fn(async () => ({
        setup: [{ tag: 'proofSetupA' }, { tag: 'proofSetupB' }],
        cleanup: [{ tag: 'proofCleanup' }],
    })),
}));

jest.mock('../account-state', () => ({
    fetchConfidentialAccountState: jest.fn(async () => ({
        ciphertexts: { availableBalance: new Uint8Array(64) },
        decrypted: { availableBalance: 500n },
    })),
}));

jest.mock('../keys', () => ({
    decryptAesBalance: jest.fn(() => 1000n),
}));

import {
    CONFIDENTIAL_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    CONFIDENTIAL_BURN_DISCRIMINATOR,
    CONFIDENTIAL_MINT_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    CONFIDENTIAL_MINT_DISCRIMINATOR,
    APPLY_CONFIDENTIAL_PENDING_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR,
    APPLY_CONFIDENTIAL_PENDING_BURN_DISCRIMINATOR,
    TOKEN_2022_PROGRAM_ADDRESS,
    getApplyConfidentialPendingBurnInstructionDataDecoder,
    getConfidentialBurnInstructionDataDecoder,
    getConfidentialMintInstructionDataDecoder,
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

const MINT_BURN_EXT = {
    __kind: 'ConfidentialMintBurn',
    confidentialSupply: new Uint8Array(64),
    decryptableSupply: new Uint8Array(36),
    supplyElgamalPubkey: SUPPLY_PK,
    pendingBurn: new Uint8Array(64),
};
const TRANSFER_MINT_EXT = { __kind: 'ConfidentialTransferMint', auditorElgamalPubkey: { __option: 'None' } };

const fakeKeys = { elgamal: { tag: 'elgamal' }, aes: { tag: 'aes' } } as unknown as ConfidentialKeys;

/** Finds the token-program instruction inside a (mocked) mint/burn plan. */
function tokenInstructionOf(plan: any) {
    const instructions = plan.plans.map((p: any) => p.instruction ?? p);
    const ix = instructions.find((i: any) => i?.programAddress === TOKEN_2022_PROGRAM_ADDRESS);
    if (!ix) throw new Error('token instruction not found in plan');
    return ix;
}

describe('confidential mint', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        rpc = createMockRpc();
    });

    it('builds a multi-tx context-state plan: proof setup → mint → cleanup', async () => {
        const plan: any = await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        expect(plan.kind).toBe('sequential');
        expect(plan.divisible).toBe(true);
        const instructions = plan.plans.map((p: any) => p.instruction ?? p);
        // proofSetupA, proofSetupB, <mint ix>, proofCleanup
        expect(instructions[0]).toEqual({ tag: 'proofSetupA' });
        expect(instructions[1]).toEqual({ tag: 'proofSetupB' });
        expect(instructions[instructions.length - 1]).toEqual({ tag: 'proofCleanup' });
    });

    it('encodes the ConfidentialMint discriminators, context-state offsets, and ciphertexts', async () => {
        const plan: any = await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        const ix = tokenInstructionOf(plan);
        const data = getConfidentialMintInstructionDataDecoder().decode(ix.data);
        expect(data.discriminator).toBe(CONFIDENTIAL_MINT_DISCRIMINATOR);
        expect(data.confidentialMintBurnDiscriminator).toBe(CONFIDENTIAL_MINT_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR);
        // Context-state mode: all three proofs read from their records (offset 0).
        expect(data.equalityProofInstructionOffset).toBe(0);
        expect(data.ciphertextValidityProofInstructionOffset).toBe(0);
        expect(data.rangeProofInstructionOffset).toBe(0);
        expect(new Uint8Array(data.newDecryptableSupply)).toEqual(new Uint8Array(36).fill(9));
        expect(new Uint8Array(data.mintAmountAuditorCiphertextLo)).toEqual(new Uint8Array(64).fill(7));
        expect(new Uint8Array(data.mintAmountAuditorCiphertextHi)).toEqual(new Uint8Array(64).fill(8));
    });

    it('orders accounts token, mint, <3 records>, authority', async () => {
        const plan: any = await createConfidentialMintInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            destinationToken: DEST_TOKEN,
            authority: AUTHORITY,
            amount: '2',
            supplyKeys: fakeKeys,
        });

        const ix = tokenInstructionOf(plan);
        const accounts = ix.accounts.map((a: any) => a.address);
        expect(accounts[0]).toBe(DEST_TOKEN);
        expect(accounts[1]).toBe(MINT);
        // The three proof records sit between mint and authority; authority last.
        expect(accounts[accounts.length - 1]).toBe(AUTHORITY);
        expect(accounts.length).toBe(6); // token, mint, equality, ciphertextValidity, range, authority
        // The three record addresses are distinct.
        const records = accounts.slice(2, 5);
        expect(new Set(records).size).toBe(3);
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
    });
});

describe('confidential burn', () => {
    let rpc: ReturnType<typeof createMockRpc>;
    const payer = createMockSigner('Payer1111111111111111111111111111111111111');

    beforeEach(() => {
        jest.clearAllMocks();
        mockMintExtensions = [MINT_BURN_EXT, TRANSFER_MINT_EXT];
        rpc = createMockRpc();
    });

    it('encodes the ConfidentialBurn discriminators, offsets, and ciphertexts', async () => {
        const plan: any = await createConfidentialBurnInstructionPlan({
            rpc: rpc as never,
            payer,
            mint: MINT,
            tokenAccount: SOURCE_TOKEN,
            authority: AUTHORITY,
            amount: '1',
            keys: fakeKeys,
        });

        expect(plan.kind).toBe('sequential');
        const ix = tokenInstructionOf(plan);
        const data = getConfidentialBurnInstructionDataDecoder().decode(ix.data);
        expect(data.discriminator).toBe(CONFIDENTIAL_BURN_DISCRIMINATOR);
        expect(data.confidentialMintBurnDiscriminator).toBe(CONFIDENTIAL_BURN_CONFIDENTIAL_MINT_BURN_DISCRIMINATOR);
        expect(data.equalityProofInstructionOffset).toBe(0);
        expect(data.ciphertextValidityProofInstructionOffset).toBe(0);
        expect(data.rangeProofInstructionOffset).toBe(0);
        expect(new Uint8Array(data.newDecryptableAvailableBalance)).toEqual(new Uint8Array(36).fill(9));
        expect(new Uint8Array(data.burnAmountAuditorCiphertextLo)).toEqual(new Uint8Array(64).fill(7));

        // The account owner's current balance came from the decoded account state.
        expect(mockBuildBurnProofData).toHaveBeenCalledWith(
            expect.objectContaining({ currentAvailableBalance: 500n, supplyElgamalPubkey: SUPPLY_PK }),
        );
        const ixAccounts = ix.accounts.map((a: any) => a.address);
        expect(ixAccounts[0]).toBe(SOURCE_TOKEN);
        expect(ixAccounts[1]).toBe(MINT);
        expect(ixAccounts[ixAccounts.length - 1]).toBe(AUTHORITY);
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
