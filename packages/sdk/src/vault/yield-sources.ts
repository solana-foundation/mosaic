import type { Address } from '@solana/kit';
import type { YieldSourceConfig, AllocationResult } from './types';

// ─── Well-known devnet / mainnet program addresses ────────────────────────────
// Replace with real program IDs when integrating on mainnet.

/** Kamino Finance lending vault program (mainnet) */
export const KAMINO_LENDING_PROGRAM =
    'KLend2g3cP87fffoy8q1mQqGKjrTworkbiizFoMFBdc' as Address;

/** Drift Protocol clearing house (mainnet) */
export const DRIFT_PROGRAM =
    'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH' as Address;

/**
 * Placeholder address for a tokenized RWA (e.g., tokenized T-Bill) yield source.
 * In production this would be an on-chain vault/pool program.
 */
export const RWA_TBILL_PROGRAM =
    'RwAtokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' as Address;

// ─── Pre-configured yield sources ─────────────────────────────────────────────

/**
 * Kamino Finance – overcollateralized lending yield.
 * APY sourced from public Kamino API; stored in bps for precision.
 */
export const KAMINO_USDC_VAULT: YieldSourceConfig = {
    kind: 'kamino',
    name: 'Kamino USDC Lending',
    programAddress: KAMINO_LENDING_PROGRAM,
    apyBps: 580, // ~5.80% APY (simulated)
    riskTier: 'low',
    enabled: true,
};

/**
 * Drift Protocol – funding rate yield on perpetuals.
 * Higher APY but medium risk due to funding rate volatility.
 */
export const DRIFT_USDC_YIELD: YieldSourceConfig = {
    kind: 'drift',
    name: 'Drift USDC Lending',
    programAddress: DRIFT_PROGRAM,
    apyBps: 820, // ~8.20% APY (simulated)
    riskTier: 'medium',
    enabled: true,
};

/**
 * Tokenized US T-Bill yield – on-chain RWA fund.
 * Lowest risk, ~5% yield, fully backed by off-chain treasuries.
 */
export const RWA_TBILL_YIELD: YieldSourceConfig = {
    kind: 'rwa',
    name: 'Tokenized T-Bill (RWA)',
    programAddress: RWA_TBILL_PROGRAM,
    apyBps: 490, // ~4.90% APY (simulated)
    riskTier: 'low',
    enabled: true,
};

/** Default set of yield sources used in a new Treasury Vault */
export const DEFAULT_YIELD_SOURCES: YieldSourceConfig[] = [
    KAMINO_USDC_VAULT,
    DRIFT_USDC_YIELD,
    RWA_TBILL_YIELD,
];

// ─── Allocation helpers ───────────────────────────────────────────────────────

/**
 * Selects the best enabled yield source(s) for a given total amount to deploy.
 *
 * Strategy: weighted split between enabled sources, proportional to their APY.
 * Disabled or paused sources are excluded.
 *
 * @param totalAmount - Total base units to allocate across yield sources
 * @param sources - Array of configured yield sources
 * @returns Array of allocations with source + amount + pct
 */
export function allocateToYieldSources(
    totalAmount: bigint,
    sources: YieldSourceConfig[],
): AllocationResult[] {
    const active = sources.filter(s => s.enabled && s.apyBps > 0);
    if (active.length === 0 || totalAmount === 0n) return [];

    const totalApyBps = active.reduce((acc, s) => acc + s.apyBps, 0);

    const results: AllocationResult[] = [];
    let allocated = 0n;

    for (let i = 0; i < active.length; i++) {
        const source = active[i];
        if (i === active.length - 1) {
            // Last source gets the remainder to avoid rounding drift
            results.push({ source, amount: totalAmount - allocated, pct: source.apyBps / totalApyBps * 100 });
        } else {
            const pct = source.apyBps / totalApyBps;
            const amount = BigInt(Math.floor(Number(totalAmount) * pct));
            allocated += amount;
            results.push({ source, amount, pct: pct * 100 });
        }
    }

    return results;
}

/**
 * Calculates the blended weighted-average APY (in bps) across active yield sources.
 *
 * @param allocations - Result of allocateToYieldSources()
 * @param totalAmount - Total amount allocated
 */
export function blendedApyBps(allocations: AllocationResult[], totalAmount: bigint): number {
    if (allocations.length === 0 || totalAmount === 0n) return 0;
    const total = Number(totalAmount);
    return allocations.reduce((acc, a) => {
        const weight = Number(a.amount) / total;
        return acc + a.source.apyBps * weight;
    }, 0);
}

/**
 * Formats APY basis points as a human-readable percentage string.
 * @example apyBpsToString(580) // "5.80%"
 */
export function apyBpsToString(bps: number): string {
    return (bps / 100).toFixed(2) + '%';
}
