import { U64_MAX, decimalAmountToRaw, validateDecimalAmount } from '../transaction-util.js';

describe('decimalAmountToRaw', () => {
    it('scales valid decimal strings', () => {
        expect(decimalAmountToRaw('1.5', 6)).toBe(1_500_000n);
        expect(decimalAmountToRaw('1', 6)).toBe(1_000_000n);
        expect(decimalAmountToRaw('0.000001', 6)).toBe(1n);
        expect(decimalAmountToRaw('.5', 6)).toBe(500_000n);
        expect(decimalAmountToRaw('1.', 6)).toBe(1_000_000n);
        expect(decimalAmountToRaw('1', 0)).toBe(1n);
    });

    it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
        expect(decimalAmountToRaw('18446744073709.551615', 6)).toBe(18_446_744_073_709_551_615n);
    });

    it('accepts the u64 maximum and rejects one above it', () => {
        expect(decimalAmountToRaw('18446744073.709551615', 9)).toBe(U64_MAX);
        expect(() => decimalAmountToRaw('18446744073709551616', 0)).toThrow(
            'Amount exceeds the maximum u64 token amount',
        );
    });

    it.each(['0', '0.0', '.0', '0.000', 0, -0])('rejects the zero amount %p', amount => {
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Amount must be a positive number');
    });

    it('rejects negative amounts', () => {
        expect(() => decimalAmountToRaw('-1', 6)).toThrow('Amount must be a positive number');
        expect(() => decimalAmountToRaw(-1e-7, 9)).toThrow('Amount must be a positive number');
    });

    it('rejects malformed amounts instead of silently reinterpreting them', () => {
        // '1.5.5' used to parse as '1.5': split('.') discarded the extra part.
        expect(() => decimalAmountToRaw('1.5.5', 6)).toThrow('Invalid amount format');
        // '' and '.' used to yield 0n.
        expect(() => decimalAmountToRaw('', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('.', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('abc', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1e3', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('+1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw(' 1.5', 6)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw('1_000', 6)).toThrow('Invalid amount format');
    });

    it('rejects string digits beyond the mint decimals instead of truncating them', () => {
        expect(() => decimalAmountToRaw('1.23456789', 6)).toThrow('Amount cannot have more than 6 decimal places');
        expect(() => decimalAmountToRaw('1.5', 0)).toThrow('Amount cannot have more than 0 decimal places');
    });

    it('ignores trailing zeros, which do not change the value', () => {
        expect(decimalAmountToRaw('5.0', 0)).toBe(5n);
        expect(decimalAmountToRaw('1.5000000', 6)).toBe(1_500_000n);
        expect(decimalAmountToRaw('1.2345670', 6)).toBe(1_234_567n);
        // A significant digit past the limit still throws, even with a trailing zero.
        expect(() => decimalAmountToRaw('1.23456780', 6)).toThrow('Amount cannot have more than 6 decimal places');
    });

    describe('number amounts', () => {
        it('scales numbers like their decimal text', () => {
            expect(decimalAmountToRaw(1.5, 6)).toBe(1_500_000n);
            expect(decimalAmountToRaw(1.5, 18)).toBe(1_500_000_000_000_000_000n);
        });

        it('expands exponent notation without losing digits', () => {
            expect(decimalAmountToRaw(1e-7, 9)).toBe(100n);
            expect(decimalAmountToRaw(1.5e-7, 9)).toBe(150n);
            expect(decimalAmountToRaw(1e-21, 21)).toBe(1n);
            expect(decimalAmountToRaw(1.23456789012345e-15, 29)).toBe(123_456_789_012_345n);
        });

        it('rounds computed values half-up to the mint decimals', () => {
            // 0.1 + 0.2 === 0.30000000000000004 and 0.7 - 0.4 === 0.29999999999999993
            expect(decimalAmountToRaw(0.1 + 0.2, 6)).toBe(300_000n);
            expect(decimalAmountToRaw(0.7 - 0.4, 6)).toBe(300_000n);
            expect(decimalAmountToRaw(1.1 * 3, 6)).toBe(3_300_000n);
            expect(decimalAmountToRaw(1.0000005, 6)).toBe(1_000_001n);
            expect(decimalAmountToRaw(1.0000004, 6)).toBe(1_000_000n);
            expect(decimalAmountToRaw(0.9999999, 6)).toBe(1_000_000n);
            expect(decimalAmountToRaw(1.23456789012345e-15, 20)).toBe(123_457n);
        });

        it('rejects a number that rounds to zero', () => {
            expect(() => decimalAmountToRaw(1e-21, 9)).toThrow('Amount must be a positive number');
        });

        it('keeps the u64 check', () => {
            expect(() => decimalAmountToRaw(1e21, 0)).toThrow('Amount exceeds the maximum u64 token amount');
        });

        it.each([NaN, Infinity])('rejects the non-finite number %p', amount => {
            expect(() => decimalAmountToRaw(amount, 6)).toThrow('Invalid amount format');
        });
    });

    describe('above 9 decimals', () => {
        it('scales string amounts at 18 decimals', () => {
            expect(decimalAmountToRaw('1.5', 18)).toBe(1_500_000_000_000_000_000n);
            expect(decimalAmountToRaw('0.000000000000000001', 18)).toBe(1n);
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
});

describe('validateDecimalAmount', () => {
    it.each(['1', '1.', '.5', '0.000001', '9007199254740993'])('accepts %p', amount => {
        expect(() => validateDecimalAmount(amount)).not.toThrow();
    });

    it.each(['0', '0.0', '-1'])('rejects %p as not positive, like decimalAmountToRaw', amount => {
        expect(() => validateDecimalAmount(amount)).toThrow('Amount must be a positive number');
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Amount must be a positive number');
    });

    it.each(['.', '', '1e3', '+1', '1.2.3', '1,000', '1.5 '])(
        'rejects %p as malformed, like decimalAmountToRaw',
        amount => {
            expect(() => validateDecimalAmount(amount)).toThrow('Invalid amount format');
            expect(() => decimalAmountToRaw(amount, 6)).toThrow('Invalid amount format');
        },
    );

    it('rejects a long run of digits in linear time', () => {
        // `\d+\.?\d*` took seconds here: it tries every split of the digit run.
        const amount = '1'.repeat(100_000) + 'x';
        const start = Date.now();
        expect(() => validateDecimalAmount(amount)).toThrow('Invalid amount format');
        expect(() => decimalAmountToRaw(amount, 6)).toThrow('Invalid amount format');
        expect(Date.now() - start).toBeLessThan(1000);
    });
});
