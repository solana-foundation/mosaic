import type { Address, KeyPairSigner, Rpc, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';

// Shared mock proof-data instances so we can assert `.free()` is called.
const mockPubkeyProof = { toBytes: () => new Uint8Array([4]), free: jest.fn() };
const mockZeroProof = { toBytes: () => new Uint8Array([1]), free: jest.fn() };
const mockCiphertext = { free: jest.fn() };

jest.mock('@solana/zk-sdk/node', () => ({
    PubkeyValidityProofData: jest.fn(() => mockPubkeyProof),
    ZeroCiphertextProofData: jest.fn(() => mockZeroProof),
    ElGamalCiphertext: { fromBytes: jest.fn(() => mockCiphertext) },
}));

jest.mock('@solana-program/zk-elgamal-proof', () => ({
    verifyPubkeyValidity: jest.fn(async () => [{ tag: 'verifyPubkey' }]),
    verifyZeroCiphertext: jest.fn(async () => [{ tag: 'verifyZero' }]),
    verifyCiphertextCommitmentEquality: jest.fn(async () => [{ tag: 'eq' }]),
    verifyBatchedRangeProofU64: jest.fn(async () => [{ tag: 'range' }]),
    verifyCiphertextCiphertextEquality: jest.fn(async () => [{ tag: 'ctEq' }]),
    verifyBatchedGroupedCiphertext3HandlesValidity: jest.fn(async () => [{ tag: 'validity' }]),
    closeContextStateProof: jest.fn(() => ({ tag: 'close' })),
}));

import {
    verifyPubkeyValidity,
    verifyCiphertextCommitmentEquality,
    verifyBatchedRangeProofU64,
    verifyCiphertextCiphertextEquality,
    verifyBatchedGroupedCiphertext3HandlesValidity,
    closeContextStateProof,
} from '@solana-program/zk-elgamal-proof';
import {
    buildPubkeyValidityProofIxs,
    buildZeroCiphertextProofIxs,
    buildWithdrawProofIxs,
    buildTransferProofIxs,
    type ProofData,
    type ProofMode,
} from '../proof';

const tag = (ixs: unknown[]) => ixs.map(ix => (ix as { tag: string }).tag);
const fakeProof = (t: number): ProofData => ({ toBytes: () => new Uint8Array([t]), free: jest.fn() });

describe('proof instruction builders', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let payer: TransactionSigner<string>;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
        payer = createMockSigner('Payer1111111111111111111111111111111111111');
    });

    describe('buildPubkeyValidityProofIxs', () => {
        it('sibling mode: emits only the verify ix, no cleanup, passes raw proof bytes', async () => {
            const result = await buildPubkeyValidityProofIxs({ rpc, payer, elgamal: {} as never });

            expect(tag(result.setup)).toEqual(['verifyPubkey']);
            expect(result.cleanup).toEqual([]);

            const args = (verifyPubkeyValidity as jest.Mock).mock.calls[0][0];
            expect(args.proofData).toEqual(new Uint8Array([4]));
            expect(args.contextState).toBeUndefined();
            expect(mockPubkeyProof.free).toHaveBeenCalledTimes(1);
        });

        it('context-state mode: creates+verifies, emits a close ix as cleanup', async () => {
            const contextAccount = createMockSigner(
                'Ctx1111111111111111111111111111111111111111',
            ) as unknown as KeyPairSigner;
            const authority = createMockSigner('Auth111111111111111111111111111111111111111');
            const mode: ProofMode = { kind: 'context-state', contextAccount, authority };

            const result = await buildPubkeyValidityProofIxs({ rpc, payer, elgamal: {} as never, mode });

            const args = (verifyPubkeyValidity as jest.Mock).mock.calls[0][0];
            expect(args.contextState).toEqual({ contextAccount, authority: authority.address });

            expect(tag(result.cleanup)).toEqual(['close']);
            expect(closeContextStateProof as jest.Mock).toHaveBeenCalledWith({
                contextState: contextAccount.address,
                authority,
                destination: payer.address,
            });
        });
    });

    describe('buildZeroCiphertextProofIxs', () => {
        it('verifies a zero-balance proof in sibling mode', async () => {
            const result = await buildZeroCiphertextProofIxs({
                rpc,
                payer,
                elgamal: {} as never,
                ciphertext: new Uint8Array(64),
            });
            expect(tag(result.setup)).toEqual(['verifyZero']);
            expect(mockZeroProof.free).toHaveBeenCalledTimes(1);
            expect(mockCiphertext.free).toHaveBeenCalledTimes(1);
        });
    });

    describe('buildWithdrawProofIxs', () => {
        it('emits equality then range, in order', async () => {
            const result = await buildWithdrawProofIxs({
                rpc,
                payer,
                equality: { proofData: fakeProof(10) },
                range: { proofData: fakeProof(11) },
            });

            expect(tag(result.setup)).toEqual(['eq', 'range']);
            expect(result.cleanup).toEqual([]);
            expect(verifyCiphertextCommitmentEquality).toHaveBeenCalledTimes(1);
            expect(verifyBatchedRangeProofU64).toHaveBeenCalledTimes(1);
        });
    });

    describe('buildTransferProofIxs', () => {
        it('emits equality, ciphertext-validity, then range, in order', async () => {
            const result = await buildTransferProofIxs({
                rpc,
                payer,
                equality: { proofData: fakeProof(20) },
                ciphertextValidity: { proofData: fakeProof(21) },
                range: { proofData: fakeProof(22) },
            });

            expect(tag(result.setup)).toEqual(['ctEq', 'validity', 'range']);
            expect(verifyCiphertextCiphertextEquality).toHaveBeenCalledTimes(1);
            expect(verifyBatchedGroupedCiphertext3HandlesValidity).toHaveBeenCalledTimes(1);
            expect(verifyBatchedRangeProofU64).toHaveBeenCalledTimes(1);
        });

        it('context-state mode accumulates one close ix per proof', async () => {
            const ctx = (label: string) =>
                ({
                    kind: 'context-state',
                    contextAccount: createMockSigner(label) as unknown as KeyPairSigner,
                    authority: payer,
                }) as ProofMode;

            const result = await buildTransferProofIxs({
                rpc,
                payer,
                equality: { proofData: fakeProof(20), mode: ctx('Ctx1111111111111111111111111111111111111111') },
                ciphertextValidity: {
                    proofData: fakeProof(21),
                    mode: ctx('Ctx2222222222222222222222222222222222222222'),
                },
                range: { proofData: fakeProof(22), mode: ctx('Ctx3333333333333333333333333333333333333333') },
            });

            // each proof contributes [createAccount?, verify] in setup and one close in cleanup
            expect(tag(result.cleanup)).toEqual(['close', 'close', 'close']);
        });
    });
});
