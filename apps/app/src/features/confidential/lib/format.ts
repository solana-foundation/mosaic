/**
 * Formats a raw on-chain token amount (base units) into a human-readable decimal
 * string for the given number of `decimals`. Trailing zeros in the fractional
 * part are trimmed. Pure string/bigint math — no floating point.
 */
export function formatRawAmount(raw: bigint, decimals: number): string {
    if (decimals <= 0) return raw.toString();
    const negative = raw < 0n;
    const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0');
    const whole = digits.slice(0, digits.length - decimals);
    const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
    const formatted = fraction ? `${whole}.${fraction}` : whole;
    return negative ? `-${formatted}` : formatted;
}
