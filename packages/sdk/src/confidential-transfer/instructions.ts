import {
    type AccountMeta,
    AccountRole,
    type Address,
    isTransactionSigner,
    type Instruction,
    type KeyPairSigner,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { SYSVAR_INSTRUCTIONS_ADDRESS } from '@solana/sysvars';
import { getCreateAccountInstruction } from '@solana-program/system';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_CONTEXT_ACCOUNT_SIZE,
    BATCHED_RANGE_PROOF_CONTEXT_ACCOUNT_SIZE,
    CIPHERTEXT_COMMITMENT_EQUALITY_CONTEXT_ACCOUNT_SIZE,
    DECRYPTABLE_BALANCE_LENGTH,
    ELGAMAL_CIPHERTEXT_LENGTH,
    ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
    ZK_PROOF_INSTRUCTION,
} from './constants';

function signerMeta(signerOrAddress: Address | TransactionSigner<string>, role: AccountRole): AccountMeta {
    if (typeof signerOrAddress === 'string' || !isTransactionSigner(signerOrAddress)) {
        return Object.freeze({ address: signerOrAddress as Address, role });
    }

    const signerRole = role === AccountRole.WRITABLE ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
    return Object.freeze({
        address: signerOrAddress.address,
        role: signerRole,
        signer: signerOrAddress,
    });
}

function readonlyMeta(address: Address): AccountMeta {
    return Object.freeze({ address, role: AccountRole.READONLY });
}

function writableMeta(address: Address): AccountMeta {
    return Object.freeze({ address, role: AccountRole.WRITABLE });
}

function assertFixedLength(name: string, bytes: Uint8Array, length: number): void {
    if (bytes.length !== length) {
        throw new Error(`${name} must be ${length} bytes`);
    }
}

function encodeI8(value: number): number {
    if (!Number.isInteger(value) || value < -128 || value > 127) {
        throw new Error(`Proof instruction offset ${value} is outside the i8 range`);
    }
    return value < 0 ? value + 256 : value;
}

function encodeU64(value: number | bigint, name: string): Uint8Array {
    const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
    if (bigintValue < 0n || bigintValue > 0xffff_ffff_ffff_ffffn) {
        throw new Error(`${name} ${value} is outside the u64 range`);
    }

    const bytes = new Uint8Array(8);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number((bigintValue >> BigInt(index * 8)) & 0xffn);
    }
    return bytes;
}

function encodeConfidentialTransferData(input: {
    discriminator: number;
    newSourceDecryptableAvailableBalance: Uint8Array;
    transferAmountAuditorCiphertextLo: Uint8Array;
    transferAmountAuditorCiphertextHi: Uint8Array;
    equalityProofInstructionOffset: number;
    transferAmountCiphertextValidityProofInstructionOffset: number;
    feeSigmaProofInstructionOffset?: number;
    feeCiphertextValidityProofInstructionOffset?: number;
    rangeProofInstructionOffset: number;
}): Uint8Array {
    assertFixedLength(
        'newSourceDecryptableAvailableBalance',
        input.newSourceDecryptableAvailableBalance,
        DECRYPTABLE_BALANCE_LENGTH,
    );
    assertFixedLength(
        'transferAmountAuditorCiphertextLo',
        input.transferAmountAuditorCiphertextLo,
        ELGAMAL_CIPHERTEXT_LENGTH,
    );
    assertFixedLength(
        'transferAmountAuditorCiphertextHi',
        input.transferAmountAuditorCiphertextHi,
        ELGAMAL_CIPHERTEXT_LENGTH,
    );

    const hasFee = input.feeSigmaProofInstructionOffset !== undefined;
    const data = new Uint8Array(2 + DECRYPTABLE_BALANCE_LENGTH + ELGAMAL_CIPHERTEXT_LENGTH * 2 + (hasFee ? 5 : 3));
    let offset = 0;
    data[offset++] = 27;
    data[offset++] = input.discriminator;
    data.set(input.newSourceDecryptableAvailableBalance, offset);
    offset += DECRYPTABLE_BALANCE_LENGTH;
    data.set(input.transferAmountAuditorCiphertextLo, offset);
    offset += ELGAMAL_CIPHERTEXT_LENGTH;
    data.set(input.transferAmountAuditorCiphertextHi, offset);
    offset += ELGAMAL_CIPHERTEXT_LENGTH;
    data[offset++] = encodeI8(input.equalityProofInstructionOffset);
    data[offset++] = encodeI8(input.transferAmountCiphertextValidityProofInstructionOffset);
    if (hasFee) {
        data[offset++] = encodeI8(input.feeSigmaProofInstructionOffset ?? 0);
        data[offset++] = encodeI8(input.feeCiphertextValidityProofInstructionOffset ?? 0);
    }
    data[offset] = encodeI8(input.rangeProofInstructionOffset);
    return data;
}

export function getConfidentialTransferCompatInstruction(input: {
    sourceToken: Address;
    mint: Address;
    destinationToken: Address;
    equalityRecord: Address;
    ciphertextValidityRecord: Address;
    rangeRecord: Address;
    authority: TransactionSigner<string>;
    newSourceDecryptableAvailableBalance: Uint8Array;
    transferAmountAuditorCiphertextLo: Uint8Array;
    transferAmountAuditorCiphertextHi: Uint8Array;
}): Instruction {
    return Object.freeze({
        accounts: [
            writableMeta(input.sourceToken),
            readonlyMeta(input.mint),
            writableMeta(input.destinationToken),
            readonlyMeta(input.equalityRecord),
            readonlyMeta(input.ciphertextValidityRecord),
            readonlyMeta(input.rangeRecord),
            signerMeta(input.authority, AccountRole.READONLY),
        ],
        data: encodeConfidentialTransferData({
            discriminator: 7,
            newSourceDecryptableAvailableBalance: input.newSourceDecryptableAvailableBalance,
            transferAmountAuditorCiphertextLo: input.transferAmountAuditorCiphertextLo,
            transferAmountAuditorCiphertextHi: input.transferAmountAuditorCiphertextHi,
            equalityProofInstructionOffset: 0,
            transferAmountCiphertextValidityProofInstructionOffset: 0,
            rangeProofInstructionOffset: 0,
        }),
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    });
}

export function getConfigureConfidentialTransferAccountCompatInstruction(input: {
    token: Address;
    mint: Address;
    instructionsSysvarOrContextState?: Address;
    authority: TransactionSigner<string>;
    decryptableZeroBalance: Uint8Array;
    maximumPendingBalanceCreditCounter: number | bigint;
    proofInstructionOffset: number;
}): Instruction {
    assertFixedLength('decryptableZeroBalance', input.decryptableZeroBalance, DECRYPTABLE_BALANCE_LENGTH);

    const data = new Uint8Array(2 + DECRYPTABLE_BALANCE_LENGTH + 8 + 1);
    let offset = 0;
    data[offset++] = 27;
    data[offset++] = 2;
    data.set(input.decryptableZeroBalance, offset);
    offset += DECRYPTABLE_BALANCE_LENGTH;
    data.set(encodeU64(input.maximumPendingBalanceCreditCounter, 'maximumPendingBalanceCreditCounter'), offset);
    offset += 8;
    data[offset] = encodeI8(input.proofInstructionOffset);

    return Object.freeze({
        accounts: [
            writableMeta(input.token),
            readonlyMeta(input.mint),
            readonlyMeta(input.instructionsSysvarOrContextState ?? SYSVAR_INSTRUCTIONS_ADDRESS),
            signerMeta(input.authority, AccountRole.READONLY),
        ],
        data,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    });
}

export function getVerifyProofInstruction(input: {
    discriminator: number;
    proofData: Uint8Array;
    contextState?: Address;
    contextStateAuthority?: Address | TransactionSigner<string>;
}): Instruction {
    const data = new Uint8Array(1 + input.proofData.length);
    data[0] = input.discriminator;
    data.set(input.proofData, 1);

    const accounts: AccountMeta[] = [];
    if (input.contextState) {
        accounts.push({ address: input.contextState, role: AccountRole.WRITABLE });
        if (!input.contextStateAuthority) {
            throw new Error('contextStateAuthority is required when contextState is provided');
        }
        accounts.push(signerMeta(input.contextStateAuthority, AccountRole.READONLY));
    }

    return Object.freeze({
        accounts,
        data,
        programAddress: ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
    });
}

export function getCloseContextStateInstruction(input: {
    contextState: Address;
    destination: Address;
    authority: TransactionSigner<string>;
}): Instruction {
    return Object.freeze({
        accounts: [
            { address: input.contextState, role: AccountRole.WRITABLE },
            { address: input.destination, role: AccountRole.WRITABLE },
            signerMeta(input.authority, AccountRole.READONLY),
        ],
        data: new Uint8Array([ZK_PROOF_INSTRUCTION.closeContextState]),
        programAddress: ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
    });
}

export async function getCreateProofContextInstructions(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    contextAccount: KeyPairSigner;
    contextAuthority: Address;
    proofData: Uint8Array;
    proofInstruction: number;
    space: number;
}): Promise<Instruction[]> {
    const lamports = await input.rpc.getMinimumBalanceForRentExemption(BigInt(input.space)).send();
    return [
        getCreateAccountInstruction({
            payer: input.payer,
            newAccount: input.contextAccount,
            lamports,
            space: BigInt(input.space),
            programAddress: ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
        }),
        getVerifyProofInstruction({
            discriminator: input.proofInstruction,
            proofData: input.proofData,
            contextState: input.contextAccount.address,
            contextStateAuthority: input.contextAuthority,
        }),
    ];
}

export const CONFIDENTIAL_TRANSFER_PROOF_ACCOUNT_SIZES = {
    equality: CIPHERTEXT_COMMITMENT_EQUALITY_CONTEXT_ACCOUNT_SIZE,
    ciphertextValidity: BATCHED_GROUPED_CIPHERTEXT_3_HANDLES_VALIDITY_CONTEXT_ACCOUNT_SIZE,
    range: BATCHED_RANGE_PROOF_CONTEXT_ACCOUNT_SIZE,
} as const;
