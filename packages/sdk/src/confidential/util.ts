import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner, createNoopSigner } from '@solana/kit';
import { U64_MAX, decimalAmountToRaw, getMintDetails } from '../transaction-util.js';

/**
 * Normalizes an authority that may be given as a bare `Address` into a
 * `TransactionSigner`. A string becomes a no-op signer (the caller signs later,
 * mirroring `transfer/index.ts`); an existing signer is returned unchanged.
 */
export function toAuthoritySigner(authority: Address | TransactionSigner): TransactionSigner {
    return typeof authority === 'string' ? createNoopSigner(authority) : authority;
}

/**
 * Opt-in to staging a confidential operation's batched **range proof** in an SPL
 * Record account instead of passing it inline in the verify instruction's data.
 *
 * Why this exists: the inline form keeps the flow to a minimal number of
 * transactions, but leaves the range-proof transaction sitting so close to the
 * 1232-byte version-0 size limit that it cannot fit an extra compute-unit-limit
 * instruction. Callers that send with a transaction plan executor which
 * estimates and sets CU limits (kit's default does) therefore push that
 * transaction over the limit. Passing `recordBackedProof` shrinks it back below
 * the limit, at the cost of extra transactions to create, write and close the
 * record account.
 *
 * **This is a version-0 workaround.** Version-1 transactions carry the
 * compute-unit limit in a header field rather than an instruction, and give the
 * message 4096 bytes instead of 1232, so the inline proof fits with room to
 * spare. Plan with `version: 1` (see `createConfidentialTransactionPlanner`) and
 * leave this option off: it only adds transactions and rent churn there.
 *
 * Rule of thumb for version 0: omit it when you sign and send the plan's
 * transactions yourself; pass it (`{}` is enough) when an executor sets
 * compute-unit limits.
 *
 * Supported by the confidential transfer and withdraw builders. On a
 * `ConfidentialTransferFee` mint the transfer's range proof is always
 * record-backed (upstream gives the fee-aware variant no inline form), so there
 * this option only overrides the record's payer, authority and rent receiver.
 * It is also no fix for compute-unit limits there: the fee-aware plan has a
 * version-0 transaction at exactly 1232 bytes even with the record, so an
 * executor that adds a compute-unit-limit instruction overflows it. Fee-mint
 * transfers sent through such an executor need `version: 1`.
 */
export type RecordBackedProof = {
    /** Funds the record account that stages the range proof. Defaults to the operation's `payer`. */
    payer?: TransactionSigner;
    /** Signs the record account's write and close. Defaults to an ephemeral signer. */
    authority?: TransactionSigner;
    /** Receives the record account's reclaimed rent on close. Defaults to the record payer. */
    rentReceiver?: Address;
};

/**
 * Maps {@link RecordBackedProof} onto the `record*` fields the upstream
 * `get*WithRecordInstructionPlan` helpers take. Kept in one place so the
 * builders that support it stay identical in behaviour.
 */
export function toRecordProofArgs(options: RecordBackedProof): {
    recordPayer?: TransactionSigner;
    recordAuthority?: TransactionSigner;
    recordRentReceiver?: Address;
} {
    return {
        recordPayer: options.payer,
        recordAuthority: options.authority,
        recordRentReceiver: options.rentReceiver,
    };
}

/** An amount expressed either as a decimal string (e.g. `"1.5"`) or raw `bigint`. */
export type TokenAmount = string | bigint;

/**
 * Validates and scales a {@link TokenAmount} to a raw `bigint` for a known
 * number of mint `decimals` — without any RPC. `bigint` inputs are treated as
 * already-raw; decimal strings are scaled by `decimals`.
 *
 * Decimal strings are scaled via {@link decimalAmountToRaw} on the raw string
 * (no `parseFloat`): `parseFloat` accepts leading-numeric junk (`"1abc"`,
 * `"1,5"`, `"1.2.3"`) and loses precision on large/u64-scale amounts, either of
 * which would silently execute a different on-chain amount than the caller
 * supplied. Strings with more fractional digits than the mint supports are
 * rejected (rather than silently truncated by {@link decimalAmountToRaw}), and
 * the result is bounds-checked to `(0, U64_MAX]`.
 */
export function tokenAmountToRaw(amount: TokenAmount, decimals: number): bigint {
    let rawAmount: bigint;
    if (typeof amount === 'bigint') {
        rawAmount = amount;
    } else {
        const trimmed = amount.trim();
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
