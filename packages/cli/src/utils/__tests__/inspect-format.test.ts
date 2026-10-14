import type { TokenInspectionResult, TransferFeeEntry, TransferFeeInfo } from '@solana/mosaic-sdk';
import {
    formatBaseUnits,
    formatBasisPoints,
    formatLabel,
    formatRateSummaryLines,
    formatTimestamp,
    formatTokenAmount,
    formatTransferFeeEntry,
    formatValue,
} from '../inspect-format.js';

type RateInspection = Parameters<typeof formatRateSummaryLines>[0];

// 2026-01-01T00:00:00.000Z
const EFFECTIVE_AT = 1767225600n;
// Largest Unix second a JS Date can represent
const MAX_DATE_SECONDS = 8_640_000_000_000n;

const inspection = (overrides: Partial<RateInspection> = {}): RateInspection => ({
    supplyInfo: { supply: 0n, decimals: 6, isInitialized: true },
    metadata: { symbol: 'USDX' },
    ...overrides,
});

const feeEntry = (epoch: bigint, transferFeeBasisPoints: number, maximumFee: bigint): TransferFeeEntry => ({
    epoch,
    transferFeeBasisPoints,
    maximumFee,
});

const transferFee = (currentEpoch: bigint, newerEpoch: bigint): TransferFeeInfo => {
    const older = feeEntry(0n, 100, 1_000_000n);
    const newer = feeEntry(newerEpoch, 250, 5_000_000n);
    const active = currentEpoch >= newerEpoch ? newer : older;
    return {
        transferFeeBasisPoints: active.transferFeeBasisPoints,
        maximumFee: active.maximumFee,
        currentEpoch,
        newerTransferFee: newer,
        olderTransferFee: older,
        withheldAmount: 0n,
        authority: null,
        withdrawAuthority: null,
    };
};

const scaledUiAmount = (
    newMultiplierEffectiveTimestamp: bigint,
    newMultiplier = 2,
): TokenInspectionResult['scaledUiAmount'] => ({
    enabled: true,
    multiplier: 1,
    newMultiplier,
    newMultiplierEffectiveTimestamp,
});

describe('formatTokenAmount', () => {
    it('keeps bigint precision beyond Number.MAX_SAFE_INTEGER', () => {
        expect(formatTokenAmount(18_446_744_073_709_551_615n, 6)).toBe('18446744073709.551615');
    });

    it('trims trailing fraction zeros and pads leading ones', () => {
        expect(formatTokenAmount(1_500_000n, 6)).toBe('1.5');
        expect(formatTokenAmount(1_000_000n, 6)).toBe('1');
        expect(formatTokenAmount(5n, 6)).toBe('0.000005');
        expect(formatTokenAmount(0n, 6)).toBe('0');
    });

    it('leaves amounts untouched at zero decimals', () => {
        expect(formatTokenAmount(12_345n, 0)).toBe('12345');
        expect(formatTokenAmount(0, 0)).toBe('0');
    });

    it('handles negative amounts', () => {
        expect(formatTokenAmount(-1_500_000n, 6)).toBe('-1.5');
    });
});

describe('formatBaseUnits', () => {
    it('shows the raw amount next to the decimal-adjusted one', () => {
        expect(formatBaseUnits(5_000_000n, 6)).toBe('5000000 (5 at 6 decimals)');
        expect(formatBaseUnits(42n, 0)).toBe('42 (42 at 0 decimals)');
    });
});

describe('formatBasisPoints', () => {
    it('shows basis points with their percentage', () => {
        expect(formatBasisPoints(250)).toBe('250 bps (2.50%)');
        expect(formatBasisPoints(0)).toBe('0 bps (0.00%)');
        expect(formatBasisPoints(10_000)).toBe('10000 bps (100.00%)');
        expect(formatBasisPoints(-150)).toBe('-150 bps (-1.50%)');
    });
});

describe('formatTimestamp', () => {
    it('marks a zero timestamp as not scheduled', () => {
        expect(formatTimestamp(0n)).toBe('0 (not scheduled)');
        expect(formatTimestamp(0)).toBe('0 (not scheduled)');
    });

    it('appends the ISO date to a valid timestamp', () => {
        expect(formatTimestamp(EFFECTIVE_AT)).toBe('1767225600 (2026-01-01T00:00:00.000Z)');
        expect(formatTimestamp(MAX_DATE_SECONDS)).toBe('8640000000000 (+275760-09-13T00:00:00.000Z)');
    });

    it('falls back to the raw value outside the Date range', () => {
        expect(formatTimestamp(MAX_DATE_SECONDS + 1n)).toBe('8640000000001');
        expect(formatTimestamp(9_223_372_036_854_775_807n)).toBe('9223372036854775807');
    });
});

describe('formatTransferFeeEntry', () => {
    it('formats the rate, cap and epoch', () => {
        expect(formatTransferFeeEntry(feeEntry(42n, 250, 5_000_000n), 6)).toBe(
            '250 bps (2.50%), max 5000000 (5 at 6 decimals), from epoch 42',
        );
    });

    it('shows the raw cap when decimals are unknown', () => {
        expect(formatTransferFeeEntry(feeEntry(42n, 250, 5_000_000n))).toBe(
            '250 bps (2.50%), max 5000000, from epoch 42',
        );
    });
});

describe('formatLabel', () => {
    it('splits camelCase keys into title case', () => {
        expect(formatLabel('newMultiplierEffectiveTimestamp')).toBe('New Multiplier Effective Timestamp');
    });
});

describe('formatValue', () => {
    it('formats values by their extension field key', () => {
        expect(formatValue(250, 'transferFeeBasisPoints')).toBe('250 bps (2.50%)');
        expect(formatValue(500, 'currentRate')).toBe('500 bps (5.00%)');
        expect(formatValue(0n, 'newMultiplierEffectiveTimestamp')).toBe('0 (not scheduled)');
        expect(formatValue(5_000_000n, 'withheldAmount', 6)).toBe('5000000 (5 at 6 decimals)');
        expect(formatValue(5_000_000n, 'withheldAmount')).toBe('5000000');
        expect(formatValue(feeEntry(7n, 100, 0n), 'olderTransferFee', 0)).toBe(
            '100 bps (1.00%), max 0 (0 at 0 decimals), from epoch 7',
        );
    });

    it('unwraps options and keeps the key', () => {
        expect(formatValue({ __option: 'Some', value: 250 }, 'transferFeeBasisPoints')).toBe('250 bps (2.50%)');
        expect(formatValue({ __option: 'None' }, 'transferFeeBasisPoints')).toBe('None');
    });

    it('falls back to generic formatting', () => {
        expect(formatValue(undefined)).toBe('None');
        expect(formatValue(250, 'multiplier')).toBe('250');
        expect(formatValue({ amount: 1n })).toBe('{"amount":"1"}');
        expect(formatValue(new Uint8Array([1, 2, 3]))).toBe('AQID');
    });
});

describe('formatRateSummaryLines', () => {
    it('returns nothing when no rate extension is present', () => {
        expect(formatRateSummaryLines(inspection())).toEqual([]);
    });

    describe('scaled UI multiplier', () => {
        it('shows only the multiplier when nothing is scheduled', () => {
            expect(formatRateSummaryLines(inspection({ scaledUiAmount: scaledUiAmount(0n) }), EFFECTIVE_AT)).toEqual([
                ['Scaled UI Multiplier', '1'],
            ]);
        });

        it('ignores a schedule to the same multiplier', () => {
            expect(formatRateSummaryLines(inspection({ scaledUiAmount: scaledUiAmount(EFFECTIVE_AT, 1) }), 0)).toEqual([
                ['Scaled UI Multiplier', '1'],
            ]);
        });

        it('shows the pending change before its timestamp', () => {
            expect(
                formatRateSummaryLines(inspection({ scaledUiAmount: scaledUiAmount(EFFECTIVE_AT) }), EFFECTIVE_AT - 1n),
            ).toEqual([
                ['Scaled UI Multiplier', '1'],
                ['Scheduled Multiplier', '2 at 2026-01-01T00:00:00.000Z'],
            ]);
        });

        it('treats the change as active at its timestamp', () => {
            expect(
                formatRateSummaryLines(inspection({ scaledUiAmount: scaledUiAmount(EFFECTIVE_AT) }), EFFECTIVE_AT),
            ).toEqual([['Scaled UI Multiplier', '2 (since 2026-01-01T00:00:00.000Z)']]);
        });

        it('treats the change as active after its timestamp', () => {
            expect(
                formatRateSummaryLines(
                    inspection({ scaledUiAmount: scaledUiAmount(EFFECTIVE_AT) }),
                    Number(EFFECTIVE_AT) + 86_400,
                ),
            ).toEqual([['Scaled UI Multiplier', '2 (since 2026-01-01T00:00:00.000Z)']]);
        });

        it('shows the raw timestamp when it is outside the Date range', () => {
            expect(
                formatRateSummaryLines(inspection({ scaledUiAmount: scaledUiAmount(MAX_DATE_SECONDS + 1n) }), 0),
            ).toEqual([
                ['Scaled UI Multiplier', '1'],
                ['Scheduled Multiplier', '2 at 8640000000001'],
            ]);
        });
    });

    describe('transfer fee', () => {
        it('shows the pending fee before its epoch', () => {
            expect(formatRateSummaryLines(inspection({ transferFee: transferFee(9n, 10n) }))).toEqual([
                ['Transfer Fee', '1.00% (max 1 USDX)'],
                ['Scheduled Transfer Fee', '2.50% (max 5 USDX) from epoch 10'],
            ]);
        });

        it('shows only the newer fee at its epoch', () => {
            expect(formatRateSummaryLines(inspection({ transferFee: transferFee(10n, 10n) }))).toEqual([
                ['Transfer Fee', '2.50% (max 5 USDX)'],
            ]);
        });

        it('shows only the newer fee after its epoch', () => {
            expect(formatRateSummaryLines(inspection({ transferFee: transferFee(11n, 10n) }))).toEqual([
                ['Transfer Fee', '2.50% (max 5 USDX)'],
            ]);
        });

        it('uses raw units at zero decimals and omits a missing symbol', () => {
            expect(
                formatRateSummaryLines(
                    inspection({
                        supplyInfo: { supply: 0n, decimals: 0, isInitialized: true },
                        metadata: undefined,
                        transferFee: transferFee(11n, 10n),
                    }),
                ),
            ).toEqual([['Transfer Fee', '2.50% (max 5000000)']]);
        });
    });

    it('shows the interest rate as APR', () => {
        expect(
            formatRateSummaryLines(
                inspection({
                    interestBearing: {
                        currentRate: 500,
                        preUpdateAverageRate: 0,
                        initializationTimestamp: 0n,
                        lastUpdateTimestamp: 0n,
                        rateAuthority: null,
                    },
                }),
            ),
        ).toEqual([['Interest Rate', '5.00% APR']]);
    });
});
