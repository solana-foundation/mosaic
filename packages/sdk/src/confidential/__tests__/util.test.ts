import { tokenAmountToRaw } from '../util';

const U64_MAX = 18446744073709551615n; // 2^64 - 1

describe('tokenAmountToRaw', () => {
    describe('decimal string scaling', () => {
        it('scales a simple decimal by the mint decimals', () => {
            expect(tokenAmountToRaw('1.5', 6)).toBe(1_500_000n);
            expect(tokenAmountToRaw('3', 6)).toBe(3_000_000n);
        });

        it('preserves full precision for u64-scale amounts (no parseFloat round-trip)', () => {
            // parseFloat would mangle these; string scaling must be exact.
            expect(tokenAmountToRaw('18446744073.709551615', 9)).toBe(U64_MAX);
            expect(tokenAmountToRaw('9007199254740993', 0)).toBe(9007199254740993n); // float -> ...992
        });

        it('accepts an amount exactly at the u64 max', () => {
            expect(tokenAmountToRaw(U64_MAX.toString(), 0)).toBe(U64_MAX);
        });
    });

    describe('rejects malformed decimal strings', () => {
        it.each(['1abc', '1,5', '1.2.3', '1.', '.5', '-1', '', '   ', 'abc', '1e5'])(
            'throws on %p instead of silently truncating',
            (bad) => {
                expect(() => tokenAmountToRaw(bad, 6)).toThrow('Amount must be a positive number');
            },
        );

        it('rejects zero', () => {
            expect(() => tokenAmountToRaw('0', 6)).toThrow('Amount must be a positive number');
            expect(() => tokenAmountToRaw('0.0', 6)).toThrow('Amount must be a positive number');
        });
    });

    describe('u64 upper bound', () => {
        it('rejects a decimal string one above the u64 max', () => {
            expect(() => tokenAmountToRaw('18446744073.709551616', 9)).toThrow(
                'Amount exceeds the maximum u64 token amount',
            );
        });

        it('rejects a bigint above the u64 max', () => {
            expect(() => tokenAmountToRaw(U64_MAX + 1n, 9)).toThrow('Amount exceeds the maximum u64 token amount');
        });
    });

    describe('bigint inputs are treated as already-raw', () => {
        it('passes a positive bigint through unchanged', () => {
            expect(tokenAmountToRaw(42n, 6)).toBe(42n);
            expect(tokenAmountToRaw(U64_MAX, 6)).toBe(U64_MAX);
        });

        it('rejects zero and negative bigints', () => {
            expect(() => tokenAmountToRaw(0n, 6)).toThrow('Amount must be a positive number');
            expect(() => tokenAmountToRaw(-1n, 6)).toThrow('Amount must be a positive number');
        });
    });
});
