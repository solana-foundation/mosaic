import { U64_MAX, decimalAmountToRaw } from '../transaction-util.js';

describe('decimalAmountToRaw', () => {
    describe('above 9 decimals', () => {
        it('scales string amounts at 18 decimals', () => {
            expect(decimalAmountToRaw('1.5', 18)).toBe(1_500_000_000_000_000_000n);
            expect(decimalAmountToRaw('0.000000000000000001', 18)).toBe(1n);
        });

        it('scales number amounts at 18 decimals', () => {
            expect(decimalAmountToRaw(1.5, 18)).toBe(1_500_000_000_000_000_000n);
        });

        it('accepts the u64 maximum at 18 decimals and rejects one above it', () => {
            expect(decimalAmountToRaw('18.446744073709551615', 18)).toBe(U64_MAX);
            expect(() => decimalAmountToRaw('18.446744073709551616', 18)).toThrow(
                'Amount exceeds the maximum u64 token amount',
            );
        });

        it('handles 255 decimals', () => {
            expect(() => decimalAmountToRaw('1', 255)).toThrow('Amount exceeds the maximum u64 token amount');
            expect(decimalAmountToRaw('0.' + '0'.repeat(254) + '1', 255)).toBe(1n);
        });

        it('handles 10 decimals', () => {
            expect(decimalAmountToRaw('1', 10)).toBe(10_000_000_000n);
        });
    });

    it.each([256, -1, 6.5, NaN])('rejects %p decimals', decimals => {
        expect(() => decimalAmountToRaw('1', decimals)).toThrow('Decimals must be an integer between 0 and 255');
    });

    describe('at 9 decimals or fewer', () => {
        it('keeps existing conversions', () => {
            expect(decimalAmountToRaw('1.5', 6)).toBe(1_500_000n);
            expect(decimalAmountToRaw('1', 0)).toBe(1n);
            expect(decimalAmountToRaw('18446744073.709551615', 9)).toBe(U64_MAX);
        });

        it('rejects amounts above u64', () => {
            expect(() => decimalAmountToRaw('18446744073709551616', 0)).toThrow(
                'Amount exceeds the maximum u64 token amount',
            );
        });

        it('keeps the negative and malformed amount errors', () => {
            expect(() => decimalAmountToRaw('-1', 6)).toThrow('Amount must be positive');
            expect(() => decimalAmountToRaw('abc', 6)).toThrow('Invalid amount format');
        });
    });
});
