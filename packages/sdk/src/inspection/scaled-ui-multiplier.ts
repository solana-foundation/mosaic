/**
 * Scaled UI amount fields as `inspectToken` exposes them: `ScaledUiAmountInfo` carries the
 * timestamp as a bigint, `TokenDashboardData` as a decimal string.
 */
export interface ScaledUiMultiplierSchedule {
    multiplier?: number;
    newMultiplier?: number;
    // Unix seconds; zero means nothing is scheduled
    newMultiplierEffectiveTimestamp?: bigint | number | string;
}

export interface ScheduledScaledUiMultiplier {
    multiplier: number;
    // Unix seconds the scheduled multiplier takes effect at
    effectiveAt: bigint;
    // Whether `effectiveAt` has been reached, i.e. the scheduled multiplier is the one in effect
    active: boolean;
}

export interface ScaledUiMultiplierStatus {
    // Multiplier in effect at the resolved time
    multiplier: number;
    // Scheduled change, if one is set (still pending, or already in effect when `active`)
    scheduled?: ScheduledScaledUiMultiplier;
}

function toUnixSeconds(value: bigint | number | string | undefined): bigint | undefined {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : undefined;
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
    return undefined;
}

/**
 * Resolves which scaled UI multiplier is in effect at `nowSeconds` (Unix seconds, default now).
 *
 * The stored mint fields don't change when a scheduled multiplier takes effect: Token-2022 applies
 * `newMultiplier` once the clock reaches `newMultiplierEffectiveTimestamp`, and `multiplier` before.
 * A change counts as scheduled when the timestamp is above zero and `newMultiplier` differs from
 * `multiplier`. Returns `undefined` when there is no multiplier.
 */
export function resolveScaledUiMultiplier(
    schedule: ScaledUiMultiplierSchedule,
    nowSeconds: bigint | number = Math.floor(Date.now() / 1000),
): ScaledUiMultiplierStatus | undefined {
    const { multiplier, newMultiplier } = schedule;
    if (multiplier === undefined) return undefined;
    const effectiveAt = toUnixSeconds(schedule.newMultiplierEffectiveTimestamp);
    if (newMultiplier === undefined || newMultiplier === multiplier || effectiveAt === undefined || effectiveAt <= 0n) {
        return { multiplier };
    }
    const now = typeof nowSeconds === 'bigint' ? nowSeconds : BigInt(Math.floor(nowSeconds));
    const active = effectiveAt <= now;
    return {
        multiplier: active ? newMultiplier : multiplier,
        scheduled: { multiplier: newMultiplier, effectiveAt, active },
    };
}
