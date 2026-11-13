import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { GetConfidentialWithdrawWithRecordInstructionPlanInput } from '@solana-program/token-2022/confidential';
import { U64_MAX, decimalAmountToRaw, getMintDetails } from '../transaction-util.js';

/** Upstream's record-backed-proof options: every `record*` field its `…WithRecord` helpers take. */
type UpstreamRecordProofOptions = Pick<
    GetConfidentialWithdrawWithRecordInstructionPlanInput,
    Extract<keyof GetConfidentialWithdrawWithRecordInstructionPlanInput, `record${string}`>
>;

/**
 * Opt-in to staging a confidential operation's batched **range proof** in an SPL
 * Record account instead of passing it inline in the verify instruction's data.
 *
 * Why this exists: the inline form keeps the flow to a minimal number of
 * transactions, but a plain confidential transfer's inline range-proof
 * transaction is 1207 bytes at version 0, too close to the 1232-byte limit to
 * fit a compute-unit-limit instruction. Staging the proof in a record splits it
 * across write transactions, at the cost of extra transactions to create, write
 * and close the record account. Only needed when sending through an executor
 * that sets compute-unit limits (kit's default does), and only together with the
 * planner's `reserveComputeUnitLimit`: record writes fill each transaction to
 * the limit, so without the reservation there is still no room.
 *
 * **Only the plain version-0 transfer needs it.** An inline withdraw's
 * range-proof transaction still fits a compute-unit-limit instruction, and
 * version-1 transactions carry the limit in a header field with 4096 bytes to
 * spare. In both cases this option only adds transactions and rent churn.
 *
 * Supported by the confidential transfer and withdraw builders. On a fee-bearing
 * mint the transfer's range proof is always record-backed (upstream gives the
 * fee-aware variant no inline form), so there this option only overrides the
 * record's payer, authority and rent receiver.
 *
 * The fields are upstream's own (`recordPayer`, `recordAuthority`,
 * `recordRentReceiver`) and are passed through unchanged, so any `record*`
 * option upstream adds is accepted here too.
 */
export type RecordBackedProof = UpstreamRecordProofOptions;

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
