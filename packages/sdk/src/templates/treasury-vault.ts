/**
 * Treasury Vault Token Template
 *
 * A compliant, yield-enabled institutional token combining:
 *
 * - TransferHook  → KYT screening on every transfer (hook program validates against
 *                   KYC-approved allowlist; see packages/sdk/src/compliance/kyt.ts)
 * - DefaultAccountState (Frozen) → accounts start frozen; compliance authority thaws
 *                                   after KYC approval
 * - Pausable       → emergency circuit-breaker for the vault authority
 * - PermanentDelegate → institutional freeze/seize capability
 * - TransferFee    → small compliance/treasury fee (e.g., 5 bps) auto-routed to reserve
 * - Metadata       → on-chain vault identity with allocation rules in additionalMetadata
 *
 * Yield routing, allocation rules, and cross-border logic live in:
 *   packages/sdk/src/vault/
 *
 * Compliance helpers (Travel Rule, KYC, KYT) live in:
 *   packages/sdk/src/compliance/
 */

import { Token } from '../issuance';
import type { Rpc, Address, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import type { AllocationRules } from '../vault/types';
import { DEFAULT_ALLOCATION_RULES } from '../vault/types';
import { KYT_HOOK_PROGRAM_ADDRESS } from '../compliance/kyt';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TreasuryVaultTokenConfig {
    // ── Identity ──────────────────────────────────────────────────────────────
    name: string;
    symbol: string;
    decimals: number;
    uri: string;

    // ── Accounts ──────────────────────────────────────────────────────────────
    /** Authority for minting, pausing, and vault administration */
    vaultAuthority: Address | TransactionSigner<string>;
    mint: Address | TransactionSigner<string>;
    feePayer: Address | TransactionSigner<string>;

    // ── Allocation ────────────────────────────────────────────────────────────
    /** Allocation rules; defaults to 60/30/10 */
    allocationRules?: AllocationRules;

    // ── Compliance ────────────────────────────────────────────────────────────
    /**
     * Transfer hook program that enforces KYT on every token transfer.
     * Defaults to the placeholder KYT_HOOK_PROGRAM_ADDRESS.
     * Replace with your deployed hook program for production.
     */
    kytHookProgram?: Address;

    /**
     * Transfer fee in basis points collected on each transfer (default: 5 bps = 0.05%).
     * Withheld amount accumulates in recipient accounts and is collected by the
     * vault authority to fund the treasury reserve tranche.
     */
    transferFeeBps?: number;

    /** Maximum fee per transfer in base units (0 = unlimited) */
    maxTransferFeeBaseUnits?: bigint;

    // ── Optional authority overrides ──────────────────────────────────────────
    metadataAuthority?: Address;
    pausableAuthority?: Address;
    permanentDelegateAuthority?: Address;
    transferFeeAuthority?: Address;
    transferHookAuthority?: Address;
    freezeAuthority?: Address;
}

// ─── Template Function ────────────────────────────────────────────────────────

/**
 * Creates the initialization transaction for a Treasury Vault Token.
 *
 * The resulting mint has:
 * - `DefaultAccountState = Frozen`: new token accounts start frozen and must be
 *   KYC-approved before use
 * - `TransferHook`: calls the KYT hook program on every transfer
 * - `TransferFee`: collects a small fee routed to the treasury reserve
 * - `Pausable`: global emergency pause by vault authority
 * - `PermanentDelegate`: institutional freeze/seize authority
 * - `Metadata`: on-chain vault metadata including allocation rules
 *
 * @returns A FullTransaction ready to be signed and submitted
 */
export async function createTreasuryVaultInitTransaction(
    rpc: Rpc<SolanaRpcApi>,
    config: TreasuryVaultTokenConfig,
): Promise<FullTransaction> {
    const mintSigner =
        typeof config.mint === 'string' ? createNoopSigner(config.mint) : config.mint;
    const feePayerSigner =
        typeof config.feePayer === 'string' ? createNoopSigner(config.feePayer) : config.feePayer;

    const vaultAuthorityAddress =
        typeof config.vaultAuthority === 'string'
            ? config.vaultAuthority
            : config.vaultAuthority.address;

    const allocationRules = config.allocationRules ?? DEFAULT_ALLOCATION_RULES;
    const kytHookProgram = config.kytHookProgram ?? KYT_HOOK_PROGRAM_ADDRESS;
    const feeBps = config.transferFeeBps ?? 5; // 0.05%
    const maxFee = config.maxTransferFeeBaseUnits ?? BigInt(1_000 * 10 ** config.decimals); // max $1,000

    // Encode allocation rules into additional metadata for on-chain discoverability
    const additionalMetadata = new Map<string, string>([
        ['vault_type', 'treasury_vault'],
        ['allocation_yield_farm_pct', allocationRules.yieldFarm.toString()],
        ['allocation_reserve_pct', allocationRules.reserve.toString()],
        ['allocation_cross_border_pct', allocationRules.crossBorder.toString()],
        ['compliance_kyt_enabled', 'true'],
        ['compliance_kyc_required', 'true'],
        ['compliance_pausable', 'true'],
        ['compliance_permanent_delegate', 'true'],
        ['created_at', new Date().toISOString()],
    ]);

    const instructions = await new Token()
        .withMetadata({
            mintAddress: mintSigner.address,
            authority: config.metadataAuthority ?? vaultAuthorityAddress,
            metadata: {
                name: config.name,
                symbol: config.symbol,
                uri: config.uri,
            },
            additionalMetadata,
        })
        // KYT: validates every transfer against the compliance allowlist
        .withTransferHook({
            authority: config.transferHookAuthority ?? vaultAuthorityAddress,
            programId: kytHookProgram,
        })
        // Compliance fee → funds treasury reserve tranche
        .withTransferFee({
            authority: config.transferFeeAuthority ?? vaultAuthorityAddress,
            withdrawAuthority: vaultAuthorityAddress,
            feeBasisPoints: feeBps,
            maximumFee: maxFee,
        })
        // Emergency circuit-breaker
        .withPausable(config.pausableAuthority ?? vaultAuthorityAddress)
        // KYC gating: accounts start frozen, thawed after KYC approval
        .withDefaultAccountState(false) // false = Frozen
        // Institutional freeze/seize
        .withPermanentDelegate(config.permanentDelegateAuthority ?? vaultAuthorityAddress)
        .buildInstructions({
            rpc,
            decimals: config.decimals,
            mintAuthority: config.vaultAuthority,
            freezeAuthority: config.freezeAuthority ?? vaultAuthorityAddress,
            mint: mintSigner,
            feePayer: feePayerSigner,
        });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m =>
            setTransactionMessageFeePayer(
                typeof config.feePayer === 'string' ? config.feePayer : config.feePayer.address,
                m,
            ),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
}
