import type { AllocationRules, AllocationResult, YieldSourceConfig, VaultState } from './types';
import { allocateToYieldSources } from './yield-sources';

// ─── Allocation Engine ────────────────────────────────────────────────────────

/**
 * Validates that allocation percentages sum to 100.
 */
export function validateAllocationRules(rules: AllocationRules): void {
    const sum = rules.yieldFarm + rules.reserve + rules.crossBorder;
    if (sum !== 100) {
        throw new Error(
            `Allocation percentages must sum to 100. Got: yieldFarm(${rules.yieldFarm}) + reserve(${rules.reserve}) + crossBorder(${rules.crossBorder}) = ${sum}`,
        );
    }
    if (rules.yieldFarm < 0 || rules.reserve < 0 || rules.crossBorder < 0) {
        throw new Error('Allocation percentages must be non-negative.');
    }
}

/**
 * Result of running the allocation engine on a vault balance.
 */
export interface VaultAllocation {
    /** Amount routed to yield sources (base units) */
    yieldFarmAmount: bigint;
    /** Amount held as treasury reserve (base units) */
    reserveAmount: bigint;
    /** Amount kept for cross-border settlement (base units) */
    crossBorderAmount: bigint;
    /** Breakdown of yield-farm sub-allocations per source */
    yieldAllocations: AllocationResult[];
    /** Total vault balance used for this computation (base units) */
    totalBalance: bigint;
    /** Applied allocation rules */
    rules: AllocationRules;
}

/**
 * Computes how a given vault balance should be split according to the
 * configured allocation rules and available yield sources.
 *
 * @param totalBalance - Total vault balance in token base units
 * @param rules - Allocation percentages (must sum to 100)
 * @param yieldSources - Available yield sources for the yield-farm tranche
 * @returns VaultAllocation with sub-allocations per tranche
 */
export function computeVaultAllocation(
    totalBalance: bigint,
    rules: AllocationRules,
    yieldSources: YieldSourceConfig[],
): VaultAllocation {
    validateAllocationRules(rules);

    const yieldFarmAmount = BigInt(Math.floor(Number(totalBalance) * rules.yieldFarm / 100));
    const reserveAmount = BigInt(Math.floor(Number(totalBalance) * rules.reserve / 100));
    // Cross-border gets the remainder to avoid rounding loss
    const crossBorderAmount = totalBalance - yieldFarmAmount - reserveAmount;

    const yieldAllocations = allocateToYieldSources(yieldFarmAmount, yieldSources);

    return {
        yieldFarmAmount,
        reserveAmount,
        crossBorderAmount,
        yieldAllocations,
        totalBalance,
        rules,
    };
}

/**
 * Determines whether a rebalance is required by comparing the current
 * on-chain allocation to the target rules.
 *
 * A rebalance is triggered when any tranche drifts more than `driftTolerancePct`
 * away from its target (default: 5%).
 *
 * @param state - Current vault state (totals per tranche in base units)
 * @param rules - Target allocation rules
 * @param driftTolerancePct - Maximum allowed drift before rebalance (default 5)
 */
export function needsRebalance(
    state: VaultState,
    rules: AllocationRules,
    driftTolerancePct = 5,
): boolean {
    if (state.totalDeposited === 0n) return false;

    const total = Number(state.totalDeposited);

    const yieldFarmTarget = rules.yieldFarm;
    const yieldFarmActual =
        state.activeAllocations.reduce((acc, a) => acc + Number(a.amount), 0) / total * 100;

    return Math.abs(yieldFarmActual - yieldFarmTarget) > driftTolerancePct;
}

/**
 * Formats a VaultAllocation for human-readable display.
 */
export function formatAllocation(allocation: VaultAllocation, decimals: number): string {
    const fmt = (n: bigint) => (Number(n) / 10 ** decimals).toFixed(2);
    const lines: string[] = [
        `Total: ${fmt(allocation.totalBalance)}`,
        `  Yield Farm (${allocation.rules.yieldFarm}%): ${fmt(allocation.yieldFarmAmount)}`,
    ];
    for (const ya of allocation.yieldAllocations) {
        lines.push(`    → ${ya.source.name}: ${fmt(ya.amount)} (~${ya.pct.toFixed(1)}% of yield tranche)`);
    }
    lines.push(`  Reserve (${allocation.rules.reserve}%): ${fmt(allocation.reserveAmount)}`);
    lines.push(`  Cross-Border (${allocation.rules.crossBorder}%): ${fmt(allocation.crossBorderAmount)}`);
    return lines.join('\n');
}
