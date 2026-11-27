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

/**
 * Turns what the amount field holds into the plain decimal string the
 * confidential builders accept (`tokenAmountToRaw` takes `^\d+(\.\d+)?$` only),
 * or null when it is not a positive amount. The shared `AmountInput` allows
 * scientific notation and its spinner writes `1e-9` for small steps, so an
 * exponent is expanded exactly, by moving the decimal point in the digit
 * string rather than going through a float.
 */
export function toDecimalAmount(input: string): string | null {
    const match = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(input.trim());
    if (!match || (!match[1] && !match[2])) return null;
    const [, intPart = '', fracPart = '', exp = '0'] = match;
    const shift = Number(exp);
    if (!Number.isSafeInteger(shift) || Math.abs(shift) > 64) return null;

    const digits = intPart + fracPart;
    let point = intPart.length + shift;
    let padded = digits;
    if (point < 0) {
        padded = '0'.repeat(-point) + padded;
        point = 0;
    } else if (point > padded.length) {
        padded = padded + '0'.repeat(point - padded.length);
    }
    const whole = padded.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
    const fraction = padded.slice(point).replace(/0+$/, '');
    if (!/[1-9]/.test(whole + fraction)) return null;
    return fraction ? `${whole}.${fraction}` : whole;
}
