import type { Address } from '@solana/kit';

export const U64_MAX = (1n << 64n) - 1n;
export const TRANSFER_AMOUNT_LO_BITS = 16n;
export const TRANSFER_AMOUNT_HI_BITS = 32;
export const REMAINING_BALANCE_BIT_LENGTH = 64;
export const RANGE_PROOF_PADDING_BIT_LENGTH = 16;
export const POINT_LENGTH = 32;
export const ELGAMAL_CIPHERTEXT_LENGTH = POINT_LENGTH * 2;
export const DECRYPTABLE_BALANCE_LENGTH = 36;
export const GROUPED_ELGAMAL_3_HANDLES_LENGTH = POINT_LENGTH * 4;

export const ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS =
    'ZkE1Gama1Proof11111111111111111111111111111' as Address<'ZkE1Gama1Proof11111111111111111111111111111'>;

export const ZK_PROOF_INSTRUCTION = {
    closeContextState: 0,
    verifyZeroCiphertext: 1,
    verifyPubkeyValidity: 4,
    verifyCiphertextCommitmentEquality: 3,
    verifyBatchedRangeProofU64: 6,
    verifyBatchedRangeProofU128: 7,
    verifyBatchedRangeProofU256: 8,
    verifyBatchedGroupedCiphertext2HandlesValidity: 10,
    verifyBatchedGroupedCiphertext3HandlesValidity: 12,
} as const;

export const CONTEXT_STATE_META_SIZE = 33;
export const CIPHERTEXT_COMMITMENT_EQUALITY_CONTEXT_ACCOUNT_SIZE = CONTEXT_STATE_META_SIZE + 128;
export const BATCHED_RANGE_PROOF_CONTEXT_ACCOUNT_SIZE = CONTEXT_STATE_META_SIZE + 264;
export const BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_CONTEXT_ACCOUNT_SIZE = CONTEXT_STATE_META_SIZE + 352;
