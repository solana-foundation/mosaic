/**
 * KYC (Know Your Customer) Gating
 *
 * Implements role-based access control for vault participation.
 * KYC approval is represented as an on-chain account (PDA) storing
 * the approved status per user address and jurisdiction.
 *
 * The vault token uses DefaultAccountState = Frozen, meaning new token
 * accounts start frozen and can only be thawed by the compliance authority
 * once KYC is approved. The permanent-delegate + pausable extensions
 * provide freeze/seize capability for ongoing compliance.
 *
 * In production, integrate with a KYC provider (e.g., Sumsub, Jumio)
 * and use a permissioned oracle or multisig to sign approvals.
 */

import type { Address } from '@solana/kit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KycStatus = 'approved' | 'pending' | 'rejected' | 'expired' | 'suspended';

export type KycTier =
    | 'basic'       // Name + ID check; limit: $10k/day
    | 'standard'    // + Address proof; limit: $100k/day
    | 'enhanced';   // + Source of funds; unlimited

export interface KycRecord {
    /** On-chain wallet address */
    walletAddress: Address;
    /** Current KYC status */
    status: KycStatus;
    /** KYC verification tier */
    tier: KycTier;
    /** ISO 3166-1 alpha-2 jurisdiction */
    jurisdiction: string;
    /** When the KYC was approved (Unix timestamp) */
    approvedAt: number;
    /** When the KYC expires (0 = no expiry) */
    expiresAt: number;
    /** Off-chain KYC provider reference ID */
    providerRef: string;
}

export interface KycCheckResult {
    allowed: boolean;
    reason?: string;
    record?: KycRecord;
}

// ─── Simulated KYC Store ──────────────────────────────────────────────────────
// In production, this would be fetched from on-chain PDAs.

const _kycStore = new Map<string, KycRecord>();

/**
 * Registers a KYC record in the simulated on-chain store.
 * In production, this would emit a transaction with a KYC program instruction.
 */
export function registerKycRecord(record: KycRecord): void {
    _kycStore.set(record.walletAddress, record);
}

/**
 * Retrieves a KYC record for a given wallet address.
 * Returns null if no record exists (i.e., user has not started KYC).
 */
export function getKycRecord(walletAddress: Address): KycRecord | null {
    return _kycStore.get(walletAddress) ?? null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Checks whether a wallet is eligible to participate in the vault.
 *
 * Rules:
 * 1. Must have an approved KYC record
 * 2. KYC must not be expired
 * 3. Jurisdiction must be in the allowed list (if provided)
 * 4. Transfer amount must be within the tier limit
 *
 * @param walletAddress - Wallet to check
 * @param allowedJurisdictions - Allowed countries (ISO-3166-1); empty = all
 * @param transferAmountBaseUnits - Amount being transferred (for tier limit check)
 * @param decimals - Token decimals (for limit calculation)
 */
export function checkKycEligibility(
    walletAddress: Address,
    allowedJurisdictions: string[] = [],
    transferAmountBaseUnits = 0n,
    decimals = 6,
): KycCheckResult {
    const record = getKycRecord(walletAddress);

    if (!record) {
        return { allowed: false, reason: 'No KYC record found. Please complete identity verification.' };
    }

    if (record.status !== 'approved') {
        return {
            allowed: false,
            reason: `KYC status is "${record.status}". Only approved users may participate.`,
            record,
        };
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expiresAt > 0 && record.expiresAt < now) {
        return { allowed: false, reason: 'KYC has expired. Please renew your verification.', record };
    }

    if (allowedJurisdictions.length > 0 && !allowedJurisdictions.includes(record.jurisdiction)) {
        return {
            allowed: false,
            reason: `Jurisdiction "${record.jurisdiction}" is not permitted for this vault.`,
            record,
        };
    }

    // Tier-based transfer limits (in USD equivalent, using 6-decimal base units)
    const tierLimits: Record<KycTier, bigint> = {
        basic: BigInt(10_000 * 10 ** decimals),
        standard: BigInt(100_000 * 10 ** decimals),
        enhanced: BigInt(Number.MAX_SAFE_INTEGER), // unlimited
    };

    if (transferAmountBaseUnits > 0n && transferAmountBaseUnits > tierLimits[record.tier]) {
        const limitFormatted = (Number(tierLimits[record.tier]) / 10 ** decimals).toLocaleString();
        return {
            allowed: false,
            reason: `Transfer exceeds ${record.tier} KYC tier limit of $${limitFormatted}. Please upgrade KYC tier.`,
            record,
        };
    }

    return { allowed: true, record };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a KYC-approved record for testing/demo purposes.
 */
export function createMockKycRecord(
    walletAddress: Address,
    tier: KycTier = 'standard',
    jurisdiction = 'US',
): KycRecord {
    const now = Math.floor(Date.now() / 1000);
    return {
        walletAddress,
        status: 'approved',
        tier,
        jurisdiction,
        approvedAt: now,
        expiresAt: now + 365 * 24 * 3600, // 1 year
        providerRef: `MOCK-${walletAddress.slice(0, 8).toUpperCase()}`,
    };
}
