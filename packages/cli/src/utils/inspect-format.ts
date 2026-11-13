import type { TokenInspectionResult, TransferFeeEntry } from '@solana/mosaic-sdk';

export function formatLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

const BASIS_POINTS_KEY = /BasisPoints$|^currentRate$|^preUpdateAverageRate$/;
const TIMESTAMP_KEY = /Timestamp$/;
const BASE_UNIT_AMOUNT_KEYS = new Set(['maximumFee', 'withheldAmount']);
const TRANSFER_FEE_ENTRY_KEYS = new Set(['newerTransferFee', 'olderTransferFee']);

export function formatBasisPoints(bps: number): string {
    return `${bps} bps (${formatPercent(bps)})`;
}

export function formatPercent(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}

function toIsoDate(seconds: bigint | number): string | undefined {
    const date = new Date(Number(seconds) * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Unix seconds; 0 means nothing is scheduled
export function formatTimestamp(seconds: bigint | number): string {
    if (BigInt(seconds) === 0n) return '0 (not scheduled)';
    const iso = toIsoDate(seconds);
    return iso ? `${seconds} (${iso})` : String(seconds);
}

// Converts raw base units to a decimal-adjusted amount without losing bigint precision
export function formatTokenAmount(amount: bigint | number, decimals: number): string {
    const raw = BigInt(amount);
    const negative = raw < 0n;
    const abs = negative ? -raw : raw;
    const scale = 10n ** BigInt(decimals);
    const whole = abs / scale;
    const fraction = (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function formatBaseUnits(amount: bigint | number, decimals: number): string {
    return `${amount} (${formatTokenAmount(amount, decimals)} at ${decimals} decimals)`;
}

// One line per fee entry: the epoch it takes effect from, its rate and its cap
export function formatTransferFeeEntry(fee: TransferFeeEntry, decimals?: number): string {
    const max = decimals === undefined ? String(fee.maximumFee) : formatBaseUnits(fee.maximumFee, decimals);
    return `${formatBasisPoints(fee.transferFeeBasisPoints)}, max ${max}, from epoch ${fee.epoch}`;
}

export function formatValue(value: unknown, key?: string, decimals?: number): string {
    if (value === null || value === undefined) return 'None';
    if (key !== undefined) {
        if (typeof value === 'number' && BASIS_POINTS_KEY.test(key)) return formatBasisPoints(value);
        if ((typeof value === 'bigint' || typeof value === 'number') && TIMESTAMP_KEY.test(key)) {
            return formatTimestamp(value);
        }
        if ((typeof value === 'bigint' || typeof value === 'number') && BASE_UNIT_AMOUNT_KEYS.has(key)) {
            return decimals === undefined ? String(value) : formatBaseUnits(value, decimals);
        }
        if (TRANSFER_FEE_ENTRY_KEYS.has(key) && value !== null && typeof value === 'object') {
            return formatTransferFeeEntry(value as TransferFeeEntry, decimals);
        }
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('base64');
    }
    if (value instanceof Map) {
        return [...value.entries()].map(([key, entry]) => `${key}=${entry}`).join(', ') || 'None';
    }
    if (typeof value === 'object') {
        const option = value as { __option?: unknown; value?: unknown };
        if (option.__option === 'Some') return formatValue(option.value, key, decimals);
        if (option.__option === 'None') return 'None';
        return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));
    }
    return String(value);
}

// Summary lines for the Compliance block, derived from the typed inspection fields
export function formatRateSummaryLines(
    inspection: Pick<
        TokenInspectionResult,
        'scaledUiAmount' | 'transferFee' | 'interestBearing' | 'supplyInfo' | 'metadata'
    >,
    nowSeconds: bigint | number = Math.floor(Date.now() / 1000),
): [string, string][] {
    const { scaledUiAmount, transferFee, interestBearing, supplyInfo } = inspection;
    const symbol = inspection.metadata?.symbol ? ` ${inspection.metadata.symbol}` : '';
    const lines: [string, string][] = [];
    if (scaledUiAmount?.multiplier !== undefined) {
        // The stored fields don't change when a scheduled multiplier takes effect, so compare against now
        const { multiplier, newMultiplier, newMultiplierEffectiveTimestamp: effectiveAt } = scaledUiAmount;
        const scheduled =
            newMultiplier !== undefined &&
            newMultiplier !== multiplier &&
            effectiveAt !== undefined &&
            effectiveAt > 0n;
        if (!scheduled) {
            lines.push(['Scaled UI Multiplier', String(multiplier)]);
        } else {
            const when = toIsoDate(effectiveAt) ?? String(effectiveAt);
            if (effectiveAt <= BigInt(nowSeconds)) {
                lines.push(['Scaled UI Multiplier', `${newMultiplier} (since ${when})`]);
            } else {
                lines.push(['Scaled UI Multiplier', String(multiplier)]);
                lines.push(['Scheduled Multiplier', `${newMultiplier} at ${when}`]);
            }
        }
    }
    if (transferFee) {
        const max = formatTokenAmount(transferFee.maximumFee, supplyInfo.decimals);
        lines.push(['Transfer Fee', `${formatPercent(transferFee.transferFeeBasisPoints)} (max ${max}${symbol})`]);
        // SetTransferFee only takes effect two epochs later; until then the newer entry is pending
        const { newerTransferFee, currentEpoch } = transferFee;
        if (newerTransferFee.epoch > currentEpoch) {
            const newerMax = formatTokenAmount(newerTransferFee.maximumFee, supplyInfo.decimals);
            lines.push([
                'Scheduled Transfer Fee',
                `${formatPercent(newerTransferFee.transferFeeBasisPoints)} (max ${newerMax}${symbol}) from epoch ${newerTransferFee.epoch}`,
            ]);
        }
    }
    if (interestBearing) {
        lines.push(['Interest Rate', `${formatPercent(interestBearing.currentRate)} APR`]);
    }
    return lines;
}
