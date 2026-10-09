import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner, createNoopSigner } from '@solana/kit';
import { decimalAmountToRaw, getMintDetails } from '../transaction-util.js';

/**
 * Normalizes an authority that may be given as a bare `Address` into a
 * `TransactionSigner`. A string becomes a no-op signer (the caller signs later,
 * mirroring `transfer/index.ts`); an existing signer is returned unchanged.
 */
export function toAuthoritySigner(authority: Address | TransactionSigner): TransactionSigner {
    return typeof authority === 'string' ? createNoopSigner(authority) : authority;
}

/** An amount expressed either as a decimal string (e.g. `"1.5"`) or raw `bigint`. */
export type TokenAmount = string | bigint;

/** Largest token amount representable on-chain (`2^64 - 1`). */
const U64_MAX = 18446744073709551615n;

/**
 * Validates and scales a {@link TokenAmount} to a raw `bigint` for a known
 * number of mint `decimals` — without any RPC. `bigint` inputs are treated as
 * already-raw; decimal strings are scaled by `decimals`.
 *
 * Decimal strings are scaled via {@link decimalAmountToRaw} on the raw string
 * (no `parseFloat`): `parseFloat` accepts leading-numeric junk (`"1abc"`,
 * `"1,5"`, `"1.2.3"`) and loses precision on large/u64-scale amounts, either of
 * which would silently execute a different on-chain amount than the caller
 * supplied. The spellings `parseFloat` accepted without precision loss
 * (leading `+`, leading/trailing `.`, exponent notation) are normalized
 * exactly, on the string, before validation. Strings with more fractional
 * digits than the mint supports are rejected (rather than silently truncated
 * by {@link decimalAmountToRaw}), and the result is bounds-checked to
 * `(0, U64_MAX]`.
 */

/**
 * Decimal shifts beyond this magnitude can never yield a valid amount:
 * `u64` raw amounts top out at ~1.8e19 and mint decimals at 255 (`u8`), so an
 * exponent moving the decimal point farther than this is definitively out of
 * range and is rejected without materializing the expansion.
 */
const MAX_DECIMAL_SHIFT = 1000;

/**
 * Normalizes the decimal-string spellings `parseFloat` used to accept into
 * the strict form the converter requires, using exact string math (no float
 * round-trip): strips a leading `+`, expands exponent notation, adds the
 * missing integer digit for a leading `.` and drops a trailing `.`. The
 * numeric value is unchanged.
 */
function normalizeAmountString(amount: string): string {
    let normalized = amount;
    if (normalized.startsWith('+')) {
        normalized = normalized.slice(1);
    }
    const exponential = /^(\d*\.?\d*)[eE]([+-]?\d+)$/.exec(normalized);
    if (exponential) {
        const mantissa = exponential[1];
        const exponent = Number(exponential[2]);
        const [integer = '', fraction = ''] = mantissa.split('.');
        const digits = integer + fraction;
        if (digits === '') {
            return normalized; // e.g. ".e5"; the strict check rejects it below.
        }
        const point = integer.length + exponent;
        if (point > digits.length + MAX_DECIMAL_SHIFT) {
            throw new Error('Amount exceeds the maximum u64 token amount');
        }
        if (-point > MAX_DECIMAL_SHIFT) {
            throw new Error('Amount must be a positive number');
        }
        normalized =
            point <= 0
                ? `0.${'0'.repeat(-point)}${digits}`
                : point >= digits.length
                  ? digits + '0'.repeat(point - digits.length)
                  : `${digits.slice(0, point)}.${digits.slice(point)}`;
    }
    if (normalized.startsWith('.')) {
        normalized = `0${normalized}`;
    }
    if (normalized.endsWith('.')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

export function tokenAmountToRaw(amount: TokenAmount, decimals: number): bigint {
    let rawAmount: bigint;
    if (typeof amount === 'bigint') {
        rawAmount = amount;
    } else {
        const trimmed = normalizeAmountString(amount.trim());
        // Require a strict, fully-numeric decimal string; reject anything else.
        const match = /^\d+(?:\.(\d+))?$/.exec(trimmed);
        if (!match) {
            throw new Error('Amount must be a positive number');
        }
        // Reject over-precision: `decimalAmountToRaw` would otherwise truncate
        // the extra digits and build an instruction for a different amount.
        if ((match[1]?.length ?? 0) > decimals) {
            throw new Error(`Amount cannot have more than ${decimals} decimal places`);
        }
        rawAmount = decimalAmountToRaw(trimmed, decimals);
    }
    if (rawAmount <= 0n) {
        throw new Error('Amount must be a positive number');
    }
    if (rawAmount > U64_MAX) {
        throw new Error('Amount exceeds the maximum u64 token amount');
    }
    return rawAmount;
}

/**
 * Resolves a {@link TokenAmount} to a raw `bigint`, fetching the mint to read
 * its decimals. Returns the resolved raw amount and the decimals. When the mint
 * has already been fetched, prefer {@link tokenAmountToRaw} to avoid a second
 * RPC.
 */
export async function resolveRawAmount(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    amount: TokenAmount,
): Promise<{ rawAmount: bigint; decimals: number }> {
    const { decimals } = await getMintDetails(rpc, mint);
    return { rawAmount: tokenAmountToRaw(amount, decimals), decimals };
}
