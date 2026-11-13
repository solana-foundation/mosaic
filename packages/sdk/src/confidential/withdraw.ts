import { type Address, type InstructionPlan, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
import { fetchToken } from '@solana-program/token-2022';
import {
    getConfidentialWithdrawInstructionPlan,
    getConfidentialWithdrawWithRecordInstructionPlan,
} from '@solana-program/token-2022/confidential';
import { toSigner } from '../signers.js';
import { assertConfidentialKeysMatchTokenAccount, type ConfidentialKeys } from './keys.js';
import { type RecordBackedProof, type TokenAmount, resolveRawAmount } from './util.js';

/**
 * Withdraws tokens from the account's **available confidential** balance back to
 * its **non-confidential** (plaintext) balance. Wraps the official
 * `getConfidentialWithdrawInstructionPlan`, which generates and verifies the
 * required equality + batched-range proofs via context-state accounts and emits
 * the multi-transaction plan (setup → withdraw → cleanup).
 *
 * Fetches and decodes the token account to read the current available balance.
 */
export async function createConfidentialWithdrawInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The token mint (used to resolve decimals). */
    mint: Address;
    /** The confidential token account (ATA). */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to withdraw — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
    /** ElGamal keypair + AES key for this account. */
    keys: ConfidentialKeys;
    /**
     * Stage the batched range proof in an SPL Record account instead of inline in
     * the verify instruction data. Not needed for compute-unit limits: the inline
     * withdraw plan fits one when planned with `reserveComputeUnitLimit`, so this
     * only adds transactions — see {@link RecordBackedProof}.
     */
    recordBackedProof?: RecordBackedProof;
}): Promise<InstructionPlan> {
    const [{ rawAmount, decimals }, decoded] = await Promise.all([
        resolveRawAmount(input.rpc, input.mint, input.amount),
        fetchToken(input.rpc, input.tokenAccount),
    ]);

    assertConfidentialKeysMatchTokenAccount(input.keys, decoded, `token account ${input.tokenAccount}`);

    const args = {
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        mint: input.mint,
        tokenAccount: decoded.data,
        authority: toSigner(input.authority),
        amount: rawAmount,
        decimals,
        elgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
    };

    if (input.recordBackedProof !== undefined) {
        return getConfidentialWithdrawWithRecordInstructionPlan({ ...args, ...input.recordBackedProof });
    }
    return getConfidentialWithdrawInstructionPlan(args);
}
