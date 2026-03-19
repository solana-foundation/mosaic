import type { Address } from '@solana/kit';

// ─── Allocation ───────────────────────────────────────────────────────────────

/**
 * Defines how vault funds are split across strategies.
 * All percentages must sum to 100.
 */
export interface AllocationRules {
    /** % routed to yield-generating sources (e.g., Kamino, Drift) */
    yieldFarm: number;
    /** % held as liquid treasury reserve */
    reserve: number;
    /** % kept liquid for cross-border instant settlement */
    crossBorder: number;
}

export const DEFAULT_ALLOCATION_RULES: AllocationRules = {
    yieldFarm: 60,
    reserve: 30,
    crossBorder: 10,
};

// ─── Yield Sources ────────────────────────────────────────────────────────────

export type YieldSourceKind = 'kamino' | 'drift' | 'rwa' | 'usx_yield_vault' | 'custom';

export interface YieldSourceConfig {
    kind: YieldSourceKind;
    /** Display name */
    name: string;
    /** Deployed program or vault address */
    programAddress: Address;
    /** Simulated / fetched APY in basis points (e.g., 450 = 4.50%) */
    apyBps: number;
    /** Risk tier: low / medium / high */
    riskTier: 'low' | 'medium' | 'high';
    /** Whether this source is currently active */
    enabled: boolean;
    /** Additional source-specific metadata */
    meta?: Record<string, unknown>;
}

export interface AllocationResult {
    source: YieldSourceConfig;
    /** Allocated amount in token base units */
    amount: bigint;
    /** Percentage of total vault */
    pct: number;
}

// ─── Cross-border ─────────────────────────────────────────────────────────────

export type SettlementRail = 'solana_spl' | 'swift_sim' | 'sepa_sim' | 'iso20022_sim';

export interface CrossBorderTransferParams {
    /** Amount in token base units */
    amount: bigint;
    /** Receiver's on-chain address */
    recipient: Address;
    /** ISO-4217 source currency (informational) */
    sourceCurrency: string;
    /** ISO-4217 destination currency (informational) */
    destinationCurrency: string;
    /** SWIFT BIC of sending VASP */
    senderBic?: string;
    /** SWIFT BIC of receiving VASP */
    receiverBic?: string;
    /** ISO-20022 purpose code (e.g., "TRAD", "SALA") */
    purposeCode?: string;
    /** Settlement rail to use */
    rail?: SettlementRail;
    /** Applied FX rate (e.g., 1.0827 for EUR/USD) */
    fxRate?: number;
}

export interface CrossBorderTransferResult {
    /** Solana memo instruction data (the attached JSON) */
    memoData: string;
    /** Estimated settlement time in seconds */
    settlementSeconds: number;
    /** FX rate used */
    fxRate: number;
    /** Whether Travel Rule data was attached */
    travelRuleAttached: boolean;
    /** Whether the FX rate came from the live SIX API or from simulation */
    fxRateSource?: 'six_live' | 'simulated';
}

// ─── Vault Config ─────────────────────────────────────────────────────────────

export interface VaultConfig {
    /** Human-readable vault name */
    name: string;
    /** Vault token mint address */
    mint: Address;
    /** Authority that manages vault operations */
    vaultAuthority: Address;
    /** Allocation rules */
    allocation: AllocationRules;
    /** Enabled yield sources */
    yieldSources: YieldSourceConfig[];
    /** Compliance settings */
    compliance: VaultComplianceConfig;
}

export interface VaultComplianceConfig {
    /** Travel Rule threshold in token base units (e.g., 3000 USDC = 3_000_000_000 with 6 decimals) */
    travelRuleThresholdBaseUnits: bigint;
    /** Whether KYC is required for all users */
    kycRequired: boolean;
    /** Whether KYT screening is active */
    kytEnabled: boolean;
    /** Maximum single-transfer amount (0 = unlimited) */
    maxTransferBaseUnits: bigint;
    /** Allowed jurisdictions (ISO-3166-1 alpha-2 codes); empty = all */
    allowedJurisdictions: string[];
}

export const DEFAULT_VAULT_COMPLIANCE: VaultComplianceConfig = {
    travelRuleThresholdBaseUnits: 3_000_000_000n, // $3,000 with 6 decimals
    kycRequired: true,
    kytEnabled: true,
    maxTransferBaseUnits: 0n,
    allowedJurisdictions: [],
};

// ─── Vault State (off-chain simulation) ──────────────────────────────────────

export interface VaultState {
    totalDeposited: bigint;
    totalYieldEarned: bigint;
    activeAllocations: AllocationResult[];
    pendingCrossBorderTransfers: number;
    lastRebalanceTimestamp: number;
}
