import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner, createNoopSigner } from '@solana/kit';
import { type TokenAmount, getMintDetails, tokenAmountToRaw } from '../transaction-util.js';

// The amount converter is shared by every token path, so it lives in
// transaction-util.ts next to decimalAmountToRaw and U64_MAX instead of
// making sibling paths depend on the confidential module. Re-exported here so
// confidential callers keep their import path.
export { type TokenAmount, tokenAmountToRaw } from '../transaction-util.js';

/**
 * Normalizes an authority that may be given as a bare `Address` into a
 * `TransactionSigner`. A string becomes a no-op signer (the caller signs later,
 * mirroring `transfer/index.ts`); an existing signer is returned unchanged.
 */
export function toAuthoritySigner(authority: Address | TransactionSigner): TransactionSigner {
    return typeof authority === 'string' ? createNoopSigner(authority) : authority;
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
