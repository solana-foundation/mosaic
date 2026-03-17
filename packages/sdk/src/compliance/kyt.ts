/**
 * KYT (Know Your Transaction) Screening
 *
 * On-chain: implemented via the TransferHook extension. Every token transfer
 * calls the hook program, which validates the transaction against an allowlist/
 * blocklist (powered by the Token-ACL / ABL SDK already in this monorepo).
 *
 * Off-chain simulation (this file): risk-scores transactions using heuristics
 * and a mock sanctions oracle. In production, replace with a Chainanalysis /
 * Elliptic / TRM Labs integration.
 *
 * Hook Program Address (devnet placeholder):
 *   KYTHookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 *
 * To deploy a real transfer hook program, implement the SPL Transfer Hook
 * interface and register it with withTransferHook() on the vault mint.
 */

import type { Address } from '@solana/kit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface KytScreeningResult {
    allowed: boolean;
    riskLevel: RiskLevel;
    riskScore: number;  // 0–100
    flags: string[];
    recommendation: string;
}

export interface KytTransactionParams {
    senderAddress: Address;
    receiverAddress: Address;
    amountBaseUnits: bigint;
    mintAddress: Address;
    /** Optional: cross-border flag */
    isCrossBorder?: boolean;
    /** Optional: associated Travel Rule memo */
    travelRuleMemo?: string;
}

// ─── Mock Sanctions / Risk Lists ──────────────────────────────────────────────
// In production, these would be loaded from an on-chain oracle or off-chain API.

const BLOCKED_ADDRESSES = new Set<string>([
    // OFAC SDN list placeholder addresses (devnet test only)
    'BLOCKED111111111111111111111111111111111111',
    'BLOCKED222222222222222222222222222222222222',
]);

const HIGH_RISK_ADDRESSES = new Set<string>([
    'HIGHRISK1111111111111111111111111111111111',
]);

// ─── Risk Heuristics ─────────────────────────────────────────────────────────

const LARGE_TRANSFER_THRESHOLD_BASE_UNITS = 500_000_000_000n; // $500,000 with 6 decimals
const SUSPICIOUS_ROUND_MULTIPLE = 100_000_000_000n; // $100,000 exactly

/**
 * Screens a token transfer for compliance risk.
 *
 * Factors considered:
 * 1. Sanctions list check (blocked addresses)
 * 2. High-risk address check
 * 3. Large transfer heuristic (>$500k)
 * 4. Structuring detection (round-number transfers near threshold)
 * 5. Cross-border without Travel Rule memo
 *
 * @param params - Transaction details to screen
 * @param travelRuleThreshold - Threshold above which Travel Rule memo is required
 */
export function screenTransaction(
    params: KytTransactionParams,
    travelRuleThreshold = 1_000_000_000n,
): KytScreeningResult {
    const flags: string[] = [];
    let riskScore = 0;

    // 1. Sanctions check
    if (BLOCKED_ADDRESSES.has(params.senderAddress) || BLOCKED_ADDRESSES.has(params.receiverAddress)) {
        return {
            allowed: false,
            riskLevel: 'blocked',
            riskScore: 100,
            flags: ['SANCTIONS_HIT'],
            recommendation: 'Transfer blocked: address appears on sanctions list.',
        };
    }

    // 2. High-risk address
    if (HIGH_RISK_ADDRESSES.has(params.senderAddress) || HIGH_RISK_ADDRESSES.has(params.receiverAddress)) {
        flags.push('HIGH_RISK_ADDRESS');
        riskScore += 40;
    }

    // 3. Large transfer
    if (params.amountBaseUnits >= LARGE_TRANSFER_THRESHOLD_BASE_UNITS) {
        flags.push('LARGE_TRANSFER');
        riskScore += 20;
    }

    // 4. Structuring detection (transfer just below Travel Rule threshold)
    const nearThreshold =
        params.amountBaseUnits < travelRuleThreshold &&
        params.amountBaseUnits > (travelRuleThreshold * 9n) / 10n;
    if (nearThreshold) {
        flags.push('POTENTIAL_STRUCTURING');
        riskScore += 25;
    }

    // 5. Round-number amounts near large threshold
    if (params.amountBaseUnits % SUSPICIOUS_ROUND_MULTIPLE === 0n && params.amountBaseUnits >= SUSPICIOUS_ROUND_MULTIPLE) {
        flags.push('ROUND_AMOUNT');
        riskScore += 5;
    }

    // 6. Cross-border without Travel Rule
    if (params.isCrossBorder && params.amountBaseUnits >= travelRuleThreshold && !params.travelRuleMemo) {
        flags.push('MISSING_TRAVEL_RULE');
        riskScore += 30;
    }

    // Map score to risk level
    let riskLevel: RiskLevel;
    let allowed: boolean;

    if (riskScore >= 80) {
        riskLevel = 'high';
        allowed = false;
    } else if (riskScore >= 40) {
        riskLevel = 'medium';
        allowed = true; // allow with enhanced monitoring
    } else {
        riskLevel = 'low';
        allowed = true;
    }

    const recommendation = buildRecommendation(riskLevel, flags);

    return { allowed, riskLevel, riskScore, flags, recommendation };
}

function buildRecommendation(level: RiskLevel, flags: string[]): string {
    if (level === 'blocked') return 'Transfer blocked. Contact compliance team.';
    if (level === 'high') return 'Transfer rejected due to high risk score. Manual review required.';
    if (level === 'medium') return `Transfer allowed with enhanced monitoring. Flags: ${flags.join(', ')}`;
    return 'Transfer cleared.';
}

/**
 * Placeholder address for the transfer hook program that enforces KYT on-chain.
 * Deploy a real SPL Transfer Hook program and replace this with the actual address.
 */
export const KYT_HOOK_PROGRAM_ADDRESS =
    'KYTHookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' as Address;
