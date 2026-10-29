import type {
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime,
    Rpc,
    Address,
    SolanaRpcApi,
    Commitment,
} from '@solana/kit';

// Type alias for convenience - represents a complete transaction message ready to be compiled
export type FullTransaction<
    TFeePayer extends TransactionMessageWithFeePayer = TransactionMessageWithFeePayer,
    TLifetime extends TransactionMessageWithBlockhashLifetime = TransactionMessageWithBlockhashLifetime,
> = TransactionMessage & TFeePayer & TLifetime;
import {
    getBase58Decoder,
    compileTransaction,
    address,
    getTransactionCodec,
    getBase64EncodedWireTransaction,
} from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_ACL_PROGRAM_ID } from './token-acl/utils.js';

/**
 * Converts a compiled Solana transaction to a base58-encoded string.
 *
 * Note: Squads still requires base58 encoded transactions.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base58-encoded transaction as a string.
 */
export const transactionToB58 = (transaction: FullTransaction): string => {
    const compiledTransaction = compileTransaction(transaction);
    const transactionBytes = getTransactionCodec().encode(compiledTransaction);
    return getBase58Decoder().decode(transactionBytes);
};

/**
 * Converts a compiled Solana transaction to a base64-encoded string.
 *
 * Base64 encoded transactions are recommended for most use cases.
 *
 * @param transaction - The full transaction object to encode.
 * @returns The base64-encoded transaction as a string.
 */
export const transactionToB64 = (transaction: FullTransaction): string => {
    const compiledTransaction = compileTransaction(transaction);
    return getBase64EncodedWireTransaction(compiledTransaction);
};

/** Largest raw token amount representable on-chain (`2^64 - 1`). */
export const U64_MAX = 18446744073709551615n;

/**
 * Throws unless `decimals` is a valid mint decimals value. Token-2022 stores
 * decimals as a `u8`, so any whole number from 0 to 255 is valid.
 *
 * @param decimals - The number of decimals to validate
 */
export function assertValidDecimals(decimals: number): void {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new Error('Decimals must be an integer between 0 and 255');
    }
}

/**
 * Converts a decimal amount to raw token amount based on mint decimals
 *
 * Prefer passing a `string`: a `number` is stringified first, which loses
 * precision for large (u64-scale) amounts and renders values >= 1e21 in
 * exponential form. A `string` is scaled digit-by-digit with no float round-trip.
 *
 * @param decimalAmount - The decimal amount (e.g., `1.5` or `"1.5"`)
 * @param decimals - The number of decimals the token has
 * @returns The raw token amount as bigint
 * @throws If `decimals` is invalid, the amount is negative or malformed, or the raw amount exceeds u64
 */
export function decimalAmountToRaw(decimalAmount: number | string, decimals: number): bigint {
    assertValidDecimals(decimals);

    // Use the string form directly when given one (no float precision loss);
    // otherwise stringify the number.
    const amountStr = typeof decimalAmount === 'string' ? decimalAmount : decimalAmount.toString();

    // Reject negative amounts
    if (amountStr.startsWith('-')) {
        throw new Error('Amount must be positive');
    }

    // Split into integer and fractional parts
    const [integerPart, fractionalPart = ''] = amountStr.split('.');

    // Pad or truncate fractional part to match decimals
    let adjustedFractional: string;
    if (fractionalPart.length > decimals) {
        // Truncate if fractional part is longer than decimals
        adjustedFractional = fractionalPart.slice(0, decimals);
    } else {
        // Pad with zeros if fractional part is shorter than decimals
        adjustedFractional = fractionalPart.padEnd(decimals, '0');
    }

    // Concatenate integer and fractional parts
    const rawAmountStr = integerPart + adjustedFractional;

    // Validate that the resulting string is a valid numeric representation
    if (!/^\d+$/.test(rawAmountStr)) {
        throw new Error('Invalid amount format');
    }

    // Convert to BigInt
    const raw = BigInt(rawAmountStr);
    if (raw > U64_MAX) {
        throw new Error('Amount exceeds the maximum u64 token amount');
    }
    return raw;
}

/** An amount expressed either as a decimal string (e.g. `"1.5"`) or raw `bigint`. */
export type TokenAmount = string | bigint;

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
    // Expand exponent notation by locating the marker with `search` and
    // validating each half with its own anchored pattern. A single combined
    // pattern such as /^(\d*\.?\d*)[eE]([+-]?\d+)$/ backtracks in quadratic
    // time when there is no marker, because every way of splitting the digit
    // run between the two `\d*` groups fails, and it runs before any length
    // check. The anchored halves below (and the trailing-zero strip in
    // tokenAmountToRaw) keep every input linear.
    const exponentMarker = normalized.search(/[eE]/);
    if (exponentMarker !== -1) {
        const mantissa = normalized.slice(0, exponentMarker);
        const exponentPart = normalized.slice(exponentMarker + 1);
        if (/^\d*(?:\.\d*)?$/.test(mantissa) && /^[+-]?\d+$/.test(exponentPart)) {
            const exponent = Number(exponentPart);
            const [integer = '', fraction = ''] = mantissa.split('.');
            const digits = integer + fraction;
            if (digits === '') {
                return normalized; // e.g. ".e5"; the strict check rejects it below.
            }
            // An all-zero mantissa is zero whatever the exponent, so report
            // it as a non-positive amount instead of by decimal-shift bounds.
            if (/^0*$/.test(digits)) {
                return '0';
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
    }
    if (normalized.startsWith('.')) {
        normalized = `0${normalized}`;
    }
    if (normalized.endsWith('.')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * Validates and scales a {@link TokenAmount} to a raw `bigint` for a known
 * number of mint `decimals`, without any RPC. `bigint` inputs are treated as
 * already-raw; decimal strings are scaled by `decimals`.
 *
 * Decimal strings are scaled digit by digit on the exact string (no
 * `parseFloat`): `parseFloat` accepts leading-numeric junk (`"1abc"`,
 * `"1,5"`, `"1.2.3"`) and loses precision on large/u64-scale amounts, either
 * of which would silently execute a different on-chain amount than the caller
 * supplied. The spellings `parseFloat` accepted without precision loss
 * (leading `+`, leading/trailing `.`, exponent notation) are normalized
 * exactly, on the string, before validation. Trailing fractional zeros carry
 * no value, so `1.5000000` on a 6-decimal mint (directly or via expansion,
 * e.g. `50e-1`) is accepted as the exact value `1.5`. Strings with more
 * significant fractional digits than the mint supports are rejected (rather
 * than silently truncated), and the result is bounds-checked to
 * `(0, U64_MAX]`.
 */
export function tokenAmountToRaw(amount: TokenAmount, decimals: number): bigint {
    let rawAmount: bigint;
    if (typeof amount === 'bigint') {
        rawAmount = amount;
    } else {
        const trimmed = normalizeAmountString(amount.trim());
        // Require a strict, fully-numeric decimal string; reject anything else.
        if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
            throw new Error('Amount must be a positive number');
        }
        assertValidDecimals(decimals);
        // Trailing fractional zeros carry no value, so strip them before the
        // over-precision check: `5.0` on a 0-decimal mint and `1.5000000` on a
        // 6-decimal mint are exact spellings, not over-precision. Strip with a
        // linear scan: a `/0+$/` pattern is not anchored at the start, so the
        // engine retries from every zero in a run and degrades quadratically.
        const [integerPart, fractionalPart = ''] = trimmed.split('.');
        let end = fractionalPart.length;
        while (end > 0 && fractionalPart[end - 1] === '0') {
            end--;
        }
        const fraction = fractionalPart.slice(0, end);
        // Reject over-precision: silently truncating the extra digits would
        // build an instruction for a different amount than the caller
        // supplied.
        if (fraction.length > decimals) {
            throw new Error(`Amount cannot have more than ${decimals} decimal places`);
        }
        // The strict checks above guarantee both parts are digits, so the
        // scaled raw amount is the concatenation padded to the mint decimals.
        rawAmount = BigInt(integerPart + fraction.padEnd(decimals, '0'));
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
 * Validates a decimal-string amount without knowing the mint decimals:
 * normalizes the `parseFloat`-compatible spellings, requires the strict
 * fully-numeric form and rejects all-zero amounts, throwing the same errors
 * {@link tokenAmountToRaw} would. Lets callers fail fast on bad input before
 * any RPC. The decimals-bound checks (over-precision, u64) still live in
 * {@link tokenAmountToRaw} because they need the mint decimals.
 */
export function assertValidAmountFormat(amount: string): void {
    const normalized = normalizeAmountString(amount.trim());
    if (!/^\d+(?:\.\d+)?$/.test(normalized) || !/[1-9]/.test(normalized.replace('.', ''))) {
        throw new Error('Amount must be a positive number');
    }
}

/**
 * Token account info parsed from RPC response
 */
interface TokenAccountParsedInfo {
    mint: Address;
    state: string;
    tokenAmount?: {
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
    };
}

/**
 * Result of resolving a token account
 */
export interface ResolvedTokenAccount {
    tokenAccount: Address;
    isInitialized: boolean;
    isFrozen: boolean;
    /** Raw token balance as bigint (0 if not initialized) */
    balance: bigint;
    /** UI-friendly balance as number (0 if not initialized) */
    uiBalance: number;
}

/**
 * Determines if an address is an Associated Token Account or wallet address
 * Returns the token account address to use for any operation
 * Note this function will not ensure that the account exists onchain
 *
 * @param rpc - The Solana RPC client instance
 * @param account - The account address (could be wallet or ATA)
 * @param mint - The mint address
 * @returns Promise with the token account address, status, and balance
 */
export async function resolveTokenAccount(
    rpc: Rpc<SolanaRpcApi>,
    account: Address,
    mint: Address,
): Promise<ResolvedTokenAccount> {
    const accountInfo = await rpc.getAccountInfo(account, { encoding: 'jsonParsed' }).send();

    // Check if it's an existing token account for this mint
    if (accountInfo.value?.owner === TOKEN_2022_PROGRAM_ADDRESS) {
        const data = accountInfo.value?.data;
        if ('parsed' in data && data.parsed?.info) {
            const ataInfo = data.parsed.info as TokenAccountParsedInfo;
            if (ataInfo.mint === mint) {
                return {
                    tokenAccount: account,
                    isInitialized: true,
                    isFrozen: ataInfo.state === 'frozen',
                    balance: BigInt(ataInfo.tokenAmount?.amount ?? '0'),
                    uiBalance: ataInfo.tokenAmount?.uiAmount ?? 0,
                };
            }
            throw new Error(`Token account ${account} is not for mint ${mint} but for ${ataInfo.mint}`);
        }
        throw new Error(`Unable to parse token account data for ${account}`);
    }

    // If account exists but not a valid token program account
    if (accountInfo.value && accountInfo.value.owner !== SYSTEM_PROGRAM_ADDRESS) {
        throw new Error(`Token account ${account} is not a valid account for mint ${mint}`);
    }

    // Derive ATA for wallet address
    const [ata] = await findAssociatedTokenPda({ owner: account, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    // check if the ATA is frozen
    const ataInfo = await rpc.getAccountInfo(ata, { encoding: 'jsonParsed' }).send();
    if (ataInfo.value?.data && 'parsed' in ataInfo.value.data && ataInfo.value.data.parsed?.info) {
        const parsedInfo = ataInfo.value.data.parsed.info as TokenAccountParsedInfo;
        return {
            tokenAccount: ata,
            isInitialized: true,
            isFrozen: parsedInfo.state === 'frozen',
            balance: BigInt(parsedInfo.tokenAmount?.amount ?? '0'),
            uiBalance: parsedInfo.tokenAmount?.uiAmount ?? 0,
        };
    }

    // if the ATA doesn't exist yet, consider it frozen as it will be created through Token ACL
    return { tokenAccount: ata, isInitialized: false, isFrozen: true, balance: 0n, uiBalance: 0 };
}

/**
 * Gets mint information including decimals
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param commitment - Commitment level for the RPC call (defaults to 'confirmed')
 * @returns Promise with mint information including decimals
 */
export async function getMintDetails(rpc: Rpc<SolanaRpcApi>, mint: Address, commitment: Commitment = 'confirmed') {
    const accountInfo = await rpc.getAccountInfo(mint, { encoding: 'jsonParsed', commitment }).send();

    if (!accountInfo.value) {
        throw new Error(`Mint account ${mint} not found`);
    }

    const data = accountInfo.value.data;
    if (!('parsed' in data) || !data.parsed?.info) {
        throw new Error(`Unable to parse mint data for ${mint}`);
    }

    const mintInfo = data.parsed.info as {
        decimals: number;
        freezeAuthority?: string;
        mintAuthority?: string;
        extensions?: Array<{ extension: string; state?: Record<string, unknown> }>;
    };

    let usesTokenAcl = false;

    if (mintInfo.freezeAuthority) {
        const freezeAuthorityAccountInfo = await rpc
            .getAccountInfo(address(mintInfo.freezeAuthority), { commitment })
            .send();
        usesTokenAcl = freezeAuthorityAccountInfo.value?.owner === TOKEN_ACL_PROGRAM_ID;
    }

    return {
        decimals: mintInfo.decimals,
        freezeAuthority: mintInfo.freezeAuthority,
        mintAuthority: mintInfo.mintAuthority,
        extensions: mintInfo.extensions || [],
        usesTokenAcl,
        /** The token program that owns this mint (Token-2022 or SPL Token) */
        programAddress: accountInfo.value.owner,
    };
}

/**
 * Checks if the default account state is set to frozen
 *
 * @param extensions - The extensions of the mint
 * @returns True if the default account state is set to frozen, false otherwise
 */
export function isDefaultAccountStateSetFrozen(
    extensions: Array<{ extension: string; state?: Record<string, unknown> }>,
): boolean {
    return extensions.some(ext => ext.extension === 'defaultAccountState' && ext.state?.accountState === 'frozen');
}

/**
 * Gets the decimals of a mint
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @returns Promise with the decimals of the mint
 */
export async function getMintDecimals(rpc: Rpc<SolanaRpcApi>, mint: Address): Promise<number> {
    const accountInfo = await rpc.getAccountInfo(mint, { encoding: 'jsonParsed' }).send();

    if (!accountInfo.value) {
        throw new Error(`Mint account ${mint} not found`);
    }

    const data = accountInfo.value.data;
    if (!('parsed' in data) || !data.parsed?.info) {
        throw new Error(`Unable to parse mint data for ${mint}`);
    }

    const mintInfo = data.parsed.info as {
        decimals: number;
    };

    return mintInfo.decimals;
}
