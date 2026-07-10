import {} from '@solana/kit';
import { fetchMint, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
/** Derives the owner's associated token account for a mint (Token-2022). */
export async function resolveAta(owner, mint) {
    const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    return ata;
}
/** Reads a mint's decimals (used to format decrypted confidential amounts). */
export async function fetchMintDecimals(rpc, mint) {
    const decoded = await fetchMint(rpc, mint);
    return decoded.data.decimals;
}
/**
 * Reads the mint's `ConfidentialTransferMint` extension, or `null` when the mint
 * does not carry it (confidential transfers are unavailable — the extension
 * cannot be added after mint creation).
 */
export async function fetchConfidentialMintConfig(rpc, mint) {
    const decoded = await fetchMint(rpc, mint);
    const extensions = decoded.data.extensions;
    if (extensions.__option !== 'Some')
        return null;
    const ext = extensions.value.find(e => e.__kind === 'ConfidentialTransferMint');
    if (!ext)
        return null;
    return {
        authority: ext.authority.__option === 'Some' ? ext.authority.value : null,
        autoApproveNewAccounts: ext.autoApproveNewAccounts,
    };
}
export async function buildConfigurePlan(input) {
    const { createConfigureConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfigureConfidentialAccountInstructionPlan(input);
}
/** Approves a configured account on a whitelist mint. Signed by the confidential authority. */
export async function buildApprovePlan(input) {
    const { createApproveConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createApproveConfidentialAccountInstructionPlan(input);
}
export async function buildEnableConfidentialCreditsPlan(input) {
    const { createEnableConfidentialCreditsInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createEnableConfidentialCreditsInstructionPlan(input);
}
export async function buildDisableConfidentialCreditsPlan(input) {
    const { createDisableConfidentialCreditsInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createDisableConfidentialCreditsInstructionPlan(input);
}
export async function buildDepositPlan(input) {
    const { createConfidentialDepositInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialDepositInstructionPlan(input);
}
export async function buildApplyPlan(input) {
    const { createApplyConfidentialPendingBalanceInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createApplyConfidentialPendingBalanceInstructionPlan(input);
}
export async function buildTransferPlan(input) {
    const { createConfidentialTransferInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialTransferInstructionPlan(input);
}
export async function buildWithdrawPlan(input) {
    const { createConfidentialWithdrawInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createConfidentialWithdrawInstructionPlan(input);
}
export async function buildEmptyPlan(input) {
    const { createEmptyConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
    return createEmptyConfidentialAccountInstructionPlan(input);
}
//# sourceMappingURL=operations.js.map