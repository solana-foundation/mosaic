import { type Address, generateKeyPairSigner, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
import { resolveTokenAccount } from '../transaction-util';
import { parseDecimalAmount, unwrapAddressOption } from './accounts';
import { ZK_PROOF_INSTRUCTION } from './constants';
import {
    CONFIDENTIAL_TRANSFER_PROOF_ACCOUNT_SIZES,
    getCloseContextStateInstruction,
    getConfidentialTransferCompatInstruction,
    getCreateProofContextInstructions,
} from './instructions';
import { fetchConfidentialTransferMintContext } from './mint-context';
import { buildConfidentialTransferProofs } from './proofs';
import { createTransaction } from './transactions';
import type {
    ConfidentialTransferAuthoritySigner,
    ConfidentialTransferContextStateAccounts,
    ConfidentialTransferPlan,
} from './types';

export async function createConfidentialTransferPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    from: Address;
    to: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    amount: string;
    sourceTokenAccount?: Address;
    destinationTokenAccount?: Address;
    contextStateAccounts?: ConfidentialTransferContextStateAccounts;
}): Promise<ConfidentialTransferPlan> {
    const mintContext = await fetchConfidentialTransferMintContext(input);
    if (mintContext.transferFeeConfig) {
        throw new Error(
            'Mint has TransferFeeConfig; use createConfidentialTransferWithFeePlan for confidential transfers with fees',
        );
    }

    const rawAmount = parseDecimalAmount(input.amount, mintContext.decimals);
    const sourceTokenAccount =
        input.sourceTokenAccount ?? (await resolveTokenAccount(input.rpc, input.from, input.mint)).tokenAccount;
    const destinationTokenAccount =
        input.destinationTokenAccount ?? (await resolveTokenAccount(input.rpc, input.to, input.mint)).tokenAccount;

    const proofs = await buildConfidentialTransferProofs({
        rpc: input.rpc,
        mint: input.mint,
        sourceTokenAccount,
        destinationTokenAccount,
        authority: input.authority,
        amount: rawAmount,
        auditorElgamalPubkey: unwrapAddressOption(mintContext.confidentialTransferMint.auditorElgamalPubkey),
    });

    const contextStateAccounts = input.contextStateAccounts ?? {
        equality: await generateKeyPairSigner(),
        ciphertextValidity: await generateKeyPairSigner(),
        range: await generateKeyPairSigner(),
    };

    const setupInstructionGroups = await Promise.all([
        getCreateProofContextInstructions({
            rpc: input.rpc,
            payer: input.feePayer,
            contextAccount: contextStateAccounts.equality,
            contextAuthority: input.authority.address,
            proofData: proofs.equalityProof.toBytes(),
            proofInstruction: ZK_PROOF_INSTRUCTION.verifyCiphertextCommitmentEquality,
            space: CONFIDENTIAL_TRANSFER_PROOF_ACCOUNT_SIZES.equality,
        }),
        getCreateProofContextInstructions({
            rpc: input.rpc,
            payer: input.feePayer,
            contextAccount: contextStateAccounts.ciphertextValidity,
            contextAuthority: input.authority.address,
            proofData: proofs.ciphertextValidityProof.toBytes(),
            proofInstruction: ZK_PROOF_INSTRUCTION.verifyBatchedGroupedCiphertext3HandlesValidity,
            space: CONFIDENTIAL_TRANSFER_PROOF_ACCOUNT_SIZES.ciphertextValidity,
        }),
        getCreateProofContextInstructions({
            rpc: input.rpc,
            payer: input.feePayer,
            contextAccount: contextStateAccounts.range,
            contextAuthority: input.authority.address,
            proofData: proofs.rangeProof.toBytes(),
            proofInstruction: ZK_PROOF_INSTRUCTION.verifyBatchedRangeProofU128,
            space: CONFIDENTIAL_TRANSFER_PROOF_ACCOUNT_SIZES.range,
        }),
    ]);

    const setupTransactions = await Promise.all(
        setupInstructionGroups.map(instructions => createTransaction(input.rpc, input.feePayer, instructions)),
    );
    const transferTransaction = await createTransaction(input.rpc, input.feePayer, [
        getConfidentialTransferCompatInstruction({
            sourceToken: sourceTokenAccount,
            mint: input.mint,
            destinationToken: destinationTokenAccount,
            equalityRecord: contextStateAccounts.equality.address,
            ciphertextValidityRecord: contextStateAccounts.ciphertextValidity.address,
            rangeRecord: contextStateAccounts.range.address,
            authority: input.authority,
            newSourceDecryptableAvailableBalance: proofs.newDecryptableAvailableBalance,
            transferAmountAuditorCiphertextLo: proofs.transferAmountAuditorCiphertextLo,
            transferAmountAuditorCiphertextHi: proofs.transferAmountAuditorCiphertextHi,
        }),
    ]);
    const cleanupInstructions = [
        getCloseContextStateInstruction({
            contextState: contextStateAccounts.equality.address,
            destination: input.feePayer.address,
            authority: input.authority,
        }),
        getCloseContextStateInstruction({
            contextState: contextStateAccounts.ciphertextValidity.address,
            destination: input.feePayer.address,
            authority: input.authority,
        }),
        getCloseContextStateInstruction({
            contextState: contextStateAccounts.range.address,
            destination: input.feePayer.address,
            authority: input.authority,
        }),
    ];
    const cleanupTransactions = await Promise.all(
        cleanupInstructions.map(instruction => createTransaction(input.rpc, input.feePayer, [instruction])),
    );
    const cleanupTransaction = await createTransaction(input.rpc, input.feePayer, cleanupInstructions);

    return {
        sourceTokenAccount,
        destinationTokenAccount,
        contextStateAccounts: {
            equality: contextStateAccounts.equality.address,
            ciphertextValidity: contextStateAccounts.ciphertextValidity.address,
            range: contextStateAccounts.range.address,
        },
        setupTransactions,
        transferTransaction,
        cleanupTransactions,
        cleanupTransaction,
    };
}
