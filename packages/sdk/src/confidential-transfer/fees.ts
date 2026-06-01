import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
import {
    getHarvestWithheldTokensToMintForConfidentialTransferFeeInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util';
import { getMintDetails } from '../transaction-util';
import {
    fetchDecodedMint,
    fetchDecodedTokenAccount,
    getConfidentialTransferFeeMintExtension,
    getConfidentialTransferMintExtension,
    getExtensions,
    getTransferFeeConfigExtension,
    parseDecimalAmount,
} from './accounts';
import {
    assertConfidentialTransferWithFeeProofSupport,
    assertWithdrawConfidentialTransferFeesFromAccountsSupport,
    assertWithdrawConfidentialTransferFeesFromMintSupport,
    calculateTransferFee,
} from './fee-capability';
import { createTransaction } from './transactions';
import type {
    ConfidentialTransferAuthoritySigner,
    ConfidentialTransferFeeWithdrawContextStateAccounts,
    ConfidentialTransferFeeWithdrawPlan,
    ConfidentialTransferWithFeeContextStateAccounts,
    ConfidentialTransferWithFeePlan,
} from './types';

export async function createConfidentialTransferWithFeePlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    from: Address;
    to: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    amount: string;
    sourceTokenAccount?: Address;
    destinationTokenAccount?: Address;
    contextStateAccounts?: ConfidentialTransferWithFeeContextStateAccounts;
}): Promise<ConfidentialTransferWithFeePlan> {
    const decodedMint = await fetchDecodedMint(input.rpc, input.mint);
    const mintExtensions = getExtensions(decodedMint.data);
    const transferFeeConfig = getTransferFeeConfigExtension(mintExtensions);
    if (!transferFeeConfig) {
        throw new Error('Mint does not have the TransferFeeConfig extension; use createConfidentialTransferPlan');
    }
    getConfidentialTransferMintExtension(mintExtensions);
    getConfidentialTransferFeeMintExtension(mintExtensions);

    const { decimals } = await getMintDetails(input.rpc, input.mint);
    const rawAmount = parseDecimalAmount(input.amount, decimals);
    const feeConfig = transferFeeConfig.newerTransferFee;
    const { feeAmount, netAmount } = calculateTransferFee(
        rawAmount,
        feeConfig.transferFeeBasisPoints,
        feeConfig.maximumFee,
    );

    assertConfidentialTransferWithFeeProofSupport({ feeAmount, netAmount });
}

export async function createHarvestConfidentialTransferFeesTransaction(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    sources: Address[];
    feePayer: TransactionSigner<string>;
}): Promise<FullTransaction> {
    return createTransaction(input.rpc, input.feePayer, [
        getHarvestWithheldTokensToMintForConfidentialTransferFeeInstruction(
            {
                mint: input.mint,
                sources: input.sources,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ]);
}

export async function createWithdrawConfidentialTransferFeesFromMintPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    destinationTokenAccount: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    contextStateAccounts?: ConfidentialTransferFeeWithdrawContextStateAccounts;
}): Promise<ConfidentialTransferFeeWithdrawPlan> {
    await fetchDecodedMint(input.rpc, input.mint);
    await fetchDecodedTokenAccount(input.rpc, input.destinationTokenAccount);
    assertWithdrawConfidentialTransferFeesFromMintSupport();
}

export async function createWithdrawConfidentialTransferFeesFromAccountsPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    destinationTokenAccount: Address;
    sources: Address[];
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    contextStateAccounts?: ConfidentialTransferFeeWithdrawContextStateAccounts;
}): Promise<ConfidentialTransferFeeWithdrawPlan> {
    await fetchDecodedMint(input.rpc, input.mint);
    await fetchDecodedTokenAccount(input.rpc, input.destinationTokenAccount);
    if (input.sources.length === 0) {
        throw new Error('At least one source token account is required to withdraw withheld confidential fees');
    }
    assertWithdrawConfidentialTransferFeesFromAccountsSupport();
}
