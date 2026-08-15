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
        assert.throws(() => validateDecimalAmount(amount), /positive decimal number/);
    }
});
