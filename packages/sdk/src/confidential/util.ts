import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner, createNoopSigner } from '@solana/kit';
import { decimalAmountToRaw, getMintDetails } from '../transaction-util';

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

/**
 * Resolves a {@link TokenAmount} to a raw `bigint` using the mint's decimals.
 * `bigint` inputs are treated as already-raw; decimal strings are validated and
 * scaled by the mint decimals. Returns the resolved raw amount and the decimals.
 */
export async function resolveRawAmount(
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    amount: TokenAmount,
): Promise<{ rawAmount: bigint; decimals: number }> {
    const { decimals } = await getMintDetails(rpc, mint);
    if (typeof amount === 'bigint') {
        if (amount <= 0n) {
            throw new Error('Amount must be a positive number');
        }
        return { rawAmount: amount, decimals };
    }
    const decimalAmount = parseFloat(amount);
    if (isNaN(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
    }
    return { rawAmount: decimalAmountToRaw(decimalAmount, decimals), decimals };
}
