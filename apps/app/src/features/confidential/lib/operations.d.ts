import { type Address, type GetMinimumBalanceForRentExemptionApi, type InstructionPlan, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
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
export declare function resolveAta(owner: Address, mint: Address): Promise<Address>;
/** Reads a mint's decimals (used to format decrypted confidential amounts). */
export declare function fetchMintDecimals(rpc: Rpc<SolanaRpcApi>, mint: Address): Promise<number>;
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
export declare function fetchConfidentialMintConfig(rpc: Rpc<SolanaRpcApi>, mint: Address): Promise<ConfidentialMintConfig | null>;
export declare function buildConfigurePlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    owner: TransactionSigner;
    mint: Address;
    keys: ConfidentialKeys;
    maximumPendingBalanceCreditCounter?: number | bigint;
}): Promise<InstructionPlan>;
/** Approves a configured account on a whitelist mint. Signed by the confidential authority. */
export declare function buildApprovePlan(input: {
    tokenAccount: Address;
    mint: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan>;
export declare function buildEnableConfidentialCreditsPlan(input: {
    tokenAccount: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan>;
export declare function buildDisableConfidentialCreditsPlan(input: {
    tokenAccount: Address;
    authority: TransactionSigner;
}): Promise<InstructionPlan>;
export declare function buildDepositPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    tokenAccount: Address;
    authority: TransactionSigner;
    amount: string;
}): Promise<InstructionPlan>;
export declare function buildApplyPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    tokenAccount: Address;
    authority: TransactionSigner;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan>;
export declare function buildTransferPlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    mint: Address;
    sourceToken: Address;
    destinationToken: Address;
    authority: TransactionSigner;
    amount: string;
    keys: ConfidentialKeys;
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan>;
export declare function buildWithdrawPlan(input: {
    rpc: RpcWithRent;
    payer: TransactionSigner;
    mint: Address;
    tokenAccount: Address;
    authority: TransactionSigner;
    amount: string;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan>;
export declare function buildEmptyPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner;
    tokenAccount: Address;
    authority: TransactionSigner;
    keys: ConfidentialKeys;
}): Promise<InstructionPlan>;
export {};
//# sourceMappingURL=operations.d.ts.map