import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import type { ConfidentialKeys } from '@solana/mosaic-sdk/confidential';

/**
 * Thin, typed wrappers over the `@solana/mosaic-sdk/confidential` instruction-plan
 * builders. Centralizing the dynamic `import()` here keeps the `@solana/zk-sdk`
 * WASM dependency lazy (loaded only when a confidential operation runs) and off
 * the initial route bundle. Each builder returns a kit `InstructionPlan`; drive
 * it with {@link executeConfidentialPlan}.
 */

type RpcWithRent = Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;

/** Derives the owner's associated token account for a mint (Token-2022). */
export async function resolveAta(owner: Address, mint: Address): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    return ata;
}

/** Reads a mint's decimals (used to format decrypted confidential amounts). */
export async function fetchMintDecimals(rpc: Rpc<SolanaRpcApi>, mint: Address): Promise<number> {
    const decoded = await fetchMint(rpc, mint);
    return decoded.data.decimals;
}

export interface ConfidentialMintConfig {
    /** Authority allowed to approve confidential accounts, if any. */
    authority: Address | null;
    /** When true, configuring an account approves it; no approval step is needed. */
    autoApproveNewAccounts: boolean;
}

/**
 * Reads the mint's `ConfidentialTransferMint` extension, or `null` when the mint
 * does not carry it (confidential transfers are unavailable — the extension
 * cannot be added after mint creation).
 */
export async function fetchConfidentialMintConfig(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
): Promise<ConfidentialMintConfig | null> {
    const decoded = await fetchMint(rpc, mint);
    const extensions = decoded.data.extensions;
    if (extensions.__option !== 'Some') return null;

    const ext = extensions.value.find(e => e.__kind === 'ConfidentialTransferMint');
    if (!ext) return null;

    return {
        authority: ext.authority.__option === 'Some' ? ext.authority.value : null,
        autoApproveNewAccounts: ext.autoApproveNewAccounts,
    };
}

export async function buildConfigurePlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    owner: TransactionSigner;
    mint: Address;
    keys: ConfidentialKeys;
    maximumPendingBalanceCreditCounter?: number | bigint;
}): Promise<InstructionPlan> {
    const { createConfigureConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfigureConfidentialAccountInstructionPlan(input);
}

/** Approves a configured account on a whitelist mint. Signed by the confidential authority. */
export async function buildApprovePlan(input: {
    tokenAccount: Address;
    mint: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan> {
    const { createApproveConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createApproveConfidentialAccountInstructionPlan(input);
}

export async function buildEnableConfidentialCreditsPlan(input: {
    tokenAccount: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan> {
    const { createEnableConfidentialCreditsInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createEnableConfidentialCreditsInstructionPlan(input);
}

export async function buildDisableConfidentialCreditsPlan(input: {
    tokenAccount: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan> {
    const { createDisableConfidentialCreditsInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createDisableConfidentialCreditsInstructionPlan(input);
}

export async function buildDepositPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    tokenAccount: Address;
    authority: TransactionSigner;
    amount: string;
}): Promise<InstructionPlan> {
    const { createConfidentialDepositInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialDepositInstructionPlan(input);
}

export async function buildApplyPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    tokenAccount: Address;
    authority: TransactionSigner;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const { createApplyConfidentialPendingBalanceInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createApplyConfidentialPendingBalanceInstructionPlan(input);
}

export async function buildTransferPlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    mint: Address;
    sourceToken: Address;
    destinationToken: Address;
    authority: TransactionSigner;
    amount: string;
    keys: ConfidentialKeys;
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan> {
    const { createConfidentialTransferInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialTransferInstructionPlan(input);
}

export async function buildWithdrawPlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    mint: Address;
    tokenAccount: Address;
    authority: TransactionSigner;
    amount: string;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const { createConfidentialWithdrawInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialWithdrawInstructionPlan(input);
}

export async function buildEmptyPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    tokenAccount: Address;
    authority: TransactionSigner;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const { createEmptyConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createEmptyConfidentialAccountInstructionPlan(input);
}
