import { type Address, type Instruction, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
import { SYSVAR_INSTRUCTIONS_ADDRESS } from '@solana/sysvars';
import {
    ExtensionType,
    getApplyConfidentialPendingBalanceInstruction,
    getApproveConfidentialTransferAccountInstruction,
    getConfigureConfidentialTransferAccountInstruction,
    getConfidentialDepositInstruction,
    getConfidentialWithdrawInstruction,
    getCreateAssociatedTokenIdempotentInstruction,
    getDisableConfidentialCreditsInstruction,
    getDisableNonConfidentialCreditsInstruction,
    getEmptyConfidentialTransferAccountInstruction,
    getEnableConfidentialCreditsInstruction,
    getEnableNonConfidentialCreditsInstruction,
    getReallocateInstruction,
    getUpdateConfidentialTransferMintInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util';
import { getMintDetails } from '../transaction-util';
import {
    fetchDecodedTokenAccount,
    getConfidentialTransferAccountExtension,
    getExtensions,
    getResolvedTokenAccountAddress,
    parseDecimalAmount,
} from './accounts';
import { aeCiphertextFromBytes, ciphertextFromBytes, subtractPublicAmountFromCiphertext } from './ciphertext';
import { REMAINING_BALANCE_BIT_LENGTH, TRANSFER_AMOUNT_LO_BITS, ZK_PROOF_INSTRUCTION } from './constants';
import { getVerifyProofInstruction } from './instructions';
import { deriveConfidentialTransferKeys, elgamalPubkeyToAddress } from './key-derivation';
import { createTransaction } from './transactions';
import type { ConfidentialTransferAuthoritySigner } from './types';
import { loadZkSdk } from './zk-sdk';

export async function createConfigureConfidentialTransferAccountInstructions(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    tokenAccount?: Address;
    maximumPendingBalanceCreditCounter?: number | bigint;
    createAssociatedTokenAccount?: boolean;
}): Promise<{ instructions: Instruction[]; tokenAccount: Address; elgamalPubkey: Address }> {
    const zk = await loadZkSdk();
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const instructions: Instruction[] = [];
    const createAssociatedTokenAccount = input.createAssociatedTokenAccount ?? true;

    const maybeAccount = await input.rpc.getAccountInfo(tokenAccount, { encoding: 'base64' }).send();
    if (!maybeAccount.value && input.tokenAccount) {
        throw new Error('A custom token account must exist before it can be configured for confidential transfers');
    }
    if (!maybeAccount.value && createAssociatedTokenAccount) {
        instructions.push(
            getCreateAssociatedTokenIdempotentInstruction({
                ata: tokenAccount,
                owner: input.owner,
                mint: input.mint,
                payer: input.feePayer,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            }),
        );
    }
    if (maybeAccount.value) {
        const decodedToken = await fetchDecodedTokenAccount(input.rpc, tokenAccount);
        const hasConfidentialTransferAccount = getExtensions(decodedToken.data).some(
            extension => extension.__kind === 'ConfidentialTransferAccount',
        );
        if (hasConfidentialTransferAccount) {
            throw new Error(`Token account ${tokenAccount} is already configured for confidential transfers`);
        }
    }

    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount,
        zk,
    });
    const pubkeyValidityProof = new zk.PubkeyValidityProofData(elgamalKeypair);

    instructions.push(
        getReallocateInstruction(
            {
                token: tokenAccount,
                payer: input.feePayer,
                owner: input.authority,
                newExtensionTypes: [ExtensionType.ConfidentialTransferAccount],
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getConfigureConfidentialTransferAccountInstruction(
            {
                token: tokenAccount,
                mint: input.mint,
                authority: input.authority,
                decryptableZeroBalance: aesKey.encrypt(0n).toBytes(),
                maximumPendingBalanceCreditCounter: input.maximumPendingBalanceCreditCounter ?? 65_536n,
                proofInstructionOffset: 1,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getVerifyProofInstruction({
            discriminator: ZK_PROOF_INSTRUCTION.verifyPubkeyValidity,
            proofData: pubkeyValidityProof.toBytes(),
        }),
    );

    return {
        instructions,
        tokenAccount,
        elgamalPubkey: elgamalPubkeyToAddress(elgamalKeypair.pubkey()),
    };
}

export async function createConfigureConfidentialTransferAccountTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    tokenAccount?: Address;
    maximumPendingBalanceCreditCounter?: number | bigint;
    createAssociatedTokenAccount?: boolean;
}): Promise<{ transaction: FullTransaction; tokenAccount: Address; elgamalPubkey: Address }> {
    const { instructions, tokenAccount, elgamalPubkey } =
        await createConfigureConfidentialTransferAccountInstructions(input);
    return {
        transaction: await createTransaction(input.rpc, input.feePayer, instructions),
        tokenAccount,
        elgamalPubkey,
    };
}

export async function createApproveConfidentialTransferAccountTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    tokenAccount: Address;
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
}): Promise<FullTransaction> {
    return createTransaction(input.rpc, input.feePayer, [
        getApproveConfidentialTransferAccountInstruction(
            {
                token: input.tokenAccount,
                mint: input.mint,
                authority: input.authority,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ]);
}

export async function createUpdateConfidentialTransferMintTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
    autoApproveNewAccounts: boolean;
    auditorElgamalPubkey?: Address | null;
}): Promise<FullTransaction> {
    return createTransaction(input.rpc, input.feePayer, [
        getUpdateConfidentialTransferMintInstruction(
            {
                mint: input.mint,
                authority: input.authority,
                autoApproveNewAccounts: input.autoApproveNewAccounts,
                auditorElgamalPubkey: input.auditorElgamalPubkey ?? null,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ]);
}

export async function createConfidentialDepositTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
    amount: string;
    tokenAccount?: Address;
}): Promise<FullTransaction> {
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const { decimals } = await getMintDetails(input.rpc, input.mint);
    const rawAmount = parseDecimalAmount(input.amount, decimals);

    return createTransaction(input.rpc, input.feePayer, [
        getConfidentialDepositInstruction(
            {
                token: tokenAccount,
                mint: input.mint,
                authority: input.authority,
                amount: rawAmount,
                decimals,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ]);
}

export async function createApplyConfidentialPendingBalanceTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    tokenAccount?: Address;
}): Promise<FullTransaction> {
    const zk = await loadZkSdk();
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const decodedToken = await fetchDecodedTokenAccount(input.rpc, tokenAccount);
    const confidentialAccount = getConfidentialTransferAccountExtension(getExtensions(decodedToken.data));
    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount,
        zk,
    });

    const pendingLow = elgamalKeypair.secret().decrypt(ciphertextFromBytes(zk, confidentialAccount.pendingBalanceLow));
    const pendingHigh = elgamalKeypair
        .secret()
        .decrypt(ciphertextFromBytes(zk, confidentialAccount.pendingBalanceHigh));
    const availableBalance = aesKey.decrypt(aeCiphertextFromBytes(zk, confidentialAccount.decryptableAvailableBalance));
    const newAvailableBalance = availableBalance + pendingLow + (pendingHigh << TRANSFER_AMOUNT_LO_BITS);

    return createTransaction(input.rpc, input.feePayer, [
        getApplyConfidentialPendingBalanceInstruction(
            {
                token: tokenAccount,
                authority: input.authority,
                expectedPendingBalanceCreditCounter: confidentialAccount.pendingBalanceCreditCounter,
                newDecryptableAvailableBalance: aesKey.encrypt(newAvailableBalance).toBytes(),
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ]);
}

export async function createConfidentialWithdrawTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    amount: string;
    tokenAccount?: Address;
}): Promise<FullTransaction> {
    const zk = await loadZkSdk();
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const decodedToken = await fetchDecodedTokenAccount(input.rpc, tokenAccount);
    const confidentialAccount = getConfidentialTransferAccountExtension(getExtensions(decodedToken.data));
    const { decimals } = await getMintDetails(input.rpc, input.mint);
    const rawAmount = parseDecimalAmount(input.amount, decimals);
    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount,
        zk,
    });

    const currentAvailableBalance = aesKey.decrypt(
        aeCiphertextFromBytes(zk, confidentialAccount.decryptableAvailableBalance),
    );
    if (currentAvailableBalance < rawAmount) {
        throw new Error(`Insufficient confidential balance: have ${currentAvailableBalance}, need ${rawAmount}`);
    }

    const remainingBalance = currentAvailableBalance - rawAmount;
    const remainingBalanceOpening = new zk.PedersenOpening();
    const remainingBalanceCommitment = zk.PedersenCommitment.from(remainingBalance, remainingBalanceOpening);
    const remainingBalanceCiphertext = subtractPublicAmountFromCiphertext(
        zk,
        confidentialAccount.availableBalance,
        rawAmount,
    );
    const equalityProof = new zk.CiphertextCommitmentEqualityProofData(
        elgamalKeypair,
        remainingBalanceCiphertext,
        remainingBalanceCommitment,
        remainingBalanceOpening,
        remainingBalance,
    );
    const rangeProof = new zk.BatchedRangeProofU64Data(
        [remainingBalanceCommitment],
        new BigUint64Array([remainingBalance]),
        new Uint8Array([REMAINING_BALANCE_BIT_LENGTH]),
        [remainingBalanceOpening],
    );

    return createTransaction(input.rpc, input.feePayer, [
        getConfidentialWithdrawInstruction(
            {
                token: tokenAccount,
                mint: input.mint,
                instructionsSysvar: SYSVAR_INSTRUCTIONS_ADDRESS,
                authority: input.authority,
                amount: rawAmount,
                decimals,
                newDecryptableAvailableBalance: aesKey.encrypt(remainingBalance).toBytes(),
                equalityProofInstructionOffset: 1,
                rangeProofInstructionOffset: 2,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getVerifyProofInstruction({
            discriminator: ZK_PROOF_INSTRUCTION.verifyCiphertextCommitmentEquality,
            proofData: equalityProof.toBytes(),
        }),
        getVerifyProofInstruction({
            discriminator: ZK_PROOF_INSTRUCTION.verifyBatchedRangeProofU64,
            proofData: rangeProof.toBytes(),
        }),
    ]);
}

export async function createEmptyConfidentialTransferAccountTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    tokenAccount?: Address;
}): Promise<FullTransaction> {
    const zk = await loadZkSdk();
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const decodedToken = await fetchDecodedTokenAccount(input.rpc, tokenAccount);
    const confidentialAccount = getConfidentialTransferAccountExtension(getExtensions(decodedToken.data));
    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount,
        zk,
    });
    const currentAvailableBalance = aesKey.decrypt(
        aeCiphertextFromBytes(zk, confidentialAccount.decryptableAvailableBalance),
    );
    if (currentAvailableBalance !== 0n) {
        throw new Error('Confidential available balance must be zero before emptying the account');
    }

    const zeroCiphertextProof = new zk.ZeroCiphertextProofData(
        elgamalKeypair,
        ciphertextFromBytes(zk, confidentialAccount.availableBalance),
    );

    return createTransaction(input.rpc, input.feePayer, [
        getEmptyConfidentialTransferAccountInstruction(
            {
                token: tokenAccount,
                instructionsSysvarOrContextState: SYSVAR_INSTRUCTIONS_ADDRESS,
                authority: input.authority,
                proofInstructionOffset: 1,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getVerifyProofInstruction({
            discriminator: ZK_PROOF_INSTRUCTION.verifyZeroCiphertext,
            proofData: zeroCiphertextProof.toBytes(),
        }),
    ]);
}

export async function createSetConfidentialCreditsTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    tokenAccount: Address;
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
    enabled: boolean;
}): Promise<FullTransaction> {
    return createTransaction(input.rpc, input.feePayer, [
        input.enabled
            ? getEnableConfidentialCreditsInstruction(
                  { token: input.tokenAccount, authority: input.authority },
                  { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
              )
            : getDisableConfidentialCreditsInstruction(
                  { token: input.tokenAccount, authority: input.authority },
                  { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
              ),
    ]);
}

export async function createSetNonConfidentialCreditsTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    tokenAccount: Address;
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
    enabled: boolean;
}): Promise<FullTransaction> {
    return createTransaction(input.rpc, input.feePayer, [
        input.enabled
            ? getEnableNonConfidentialCreditsInstruction(
                  { token: input.tokenAccount, authority: input.authority },
                  { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
              )
            : getDisableNonConfidentialCreditsInstruction(
                  { token: input.tokenAccount, authority: input.authority },
                  { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
              ),
    ]);
}
