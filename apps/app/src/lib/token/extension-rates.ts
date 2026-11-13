/**
 * Pure display formatting for on-chain extension rates (transfer fee, interest, scaled UI).
 * Inputs are the string-safe values from `TokenDisplay`; nothing here touches bigints at rest.
 */

/** Basis points as a percentage, e.g. `250` → `"2.50%"`. */
export function formatBasisPoints(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}

/**
 * A raw base-unit amount (decimal string) adjusted by `decimals`, e.g. `("1500000", 6)` → `"1.5"`.
 * Returns the input unchanged if it isn't a non-negative integer string.
 */
export function formatRawAmount(raw: string, decimals: number): string {
    if (!/^\d+$/.test(raw)) return raw;
    const value = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = (value / divisor).toLocaleString('en-US');
    if (decimals === 0) return whole;
    const fraction = (value % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
}

/** Unix seconds (decimal string) as a UTC date, e.g. `"1790068400"` → `"2026-09-22 09:13 UTC"`. */
export function formatUnixTimestamp(seconds: string): string {
    const date = new Date(Number(seconds) * 1000);
    if (Number.isNaN(date.getTime())) return seconds;
    return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** `"2.50% (max 1 TKN)"`, or `undefined` when the fee isn't known. */
export function formatTransferFee(
    basisPoints: number | undefined,
    maximum: string | undefined,
    decimals: number | undefined,
    symbol: string | undefined,
): string | undefined {
    if (basisPoints === undefined) return undefined;
    const percent = formatBasisPoints(basisPoints);
    if (maximum === undefined) return percent;
    const amount = decimals === undefined ? maximum : formatRawAmount(maximum, decimals);
    return `${percent} (max ${symbol ? `${amount} ${symbol}` : amount})`;
}

/** `"5.00% APR"`, or `undefined` when the rate isn't known. */
export function formatInterestRate(rateBasisPoints: number | undefined): string | undefined {
    if (rateBasisPoints === undefined) return undefined;
    return `${formatBasisPoints(rateBasisPoints)} APR`;
}

/**
 * The scaled UI multiplier, with the scheduled change when one is set:
 * `"1 → 5 on 2026-09-22 09:13 UTC"` while pending, `"5 (since 2026-09-22 09:13 UTC)"` once it took effect.
 * A timestamp of `'0'` means nothing is scheduled.
 */
export function formatScaledUiMultiplier(
    multiplier: number | undefined,
    newMultiplier: number | undefined,
    effectiveTimestamp: string | undefined,
    nowSeconds: number = Math.floor(Date.now() / 1000),
): string | undefined {
    if (multiplier === undefined) return undefined;
    const scheduled =
        newMultiplier !== undefined &&
        newMultiplier !== multiplier &&
        effectiveTimestamp !== undefined &&
        /^\d+$/.test(effectiveTimestamp) &&
        effectiveTimestamp !== '0';
    if (!scheduled) return String(multiplier);
    const date = formatUnixTimestamp(effectiveTimestamp);
    if (Number(effectiveTimestamp) <= nowSeconds) return `${newMultiplier} (since ${date})`;
    return `${multiplier} → ${newMultiplier} on ${date}`;
}
