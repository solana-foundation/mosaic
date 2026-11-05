// amount.ts re-exports from @solana/mosaic-sdk, which resolves to the SDK's
// dist. Build it first (`pnpm --filter @solana/mosaic-sdk build`), or run
// `turbo test` from the repo root, which builds dependencies before testing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDecimalAmount } from './amount.js';

test('accepts positive decimal amounts without losing precision', () => {
    for (const amount of ['1', '1.', '.5', '0.000001', '9007199254740993']) {
        assert.doesNotThrow(() => validateDecimalAmount(amount));
    }
});

test('rejects inputs that the SDK cannot convert exactly', () => {
    for (const amount of ['0', '0.0', '-1', '1e3', '1abc', '1.2.3']) {
        assert.throws(() => validateDecimalAmount(amount), /Amount must be a positive number/);
    }
});
