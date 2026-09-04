import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchToken } from '@solana-program/token-2022';
import { getConfidentialWithdrawInstructionPlan } from '@solana-program/token-2022/confidential';
import { confidentialMintBurnConversionError, mintHasConfidentialMintBurnExtension } from '../transaction-util.js';
import { getConfidentialTransferAccountElgamalPubkey } from './extensions.js';
import { assertConfidentialKeysMatchAccount, type ConfidentialKeys } from './keys.js';
import { type TokenAmount, resolveRawAmount, toAuthoritySigner } from './util.js';

/**
 * Withdraws tokens from the account's **available confidential** balance back to
 * its **non-confidential** (plaintext) balance. Wraps the official
 * `getConfidentialWithdrawInstructionPlan`, which generates and verifies the
 * required equality + batched-range proofs via context-state accounts and emits
 * the multi-transaction plan (setup → withdraw → cleanup).
 *
 * Not available on a `ConfidentialMintBurn` mint: Token-2022 rejects
 * `ConfidentialWithdraw` on such a mint with `IllegalMintBurnConversion`, because
 * its supply is only ever encrypted and there is no plaintext side to withdraw
 * to. Holders redeem via `createConfidentialBurnInstructionPlan` instead; this
 * builder fails fast rather than emitting a transaction the chain would reject.
 *
 * Fetches and decodes the token account to read the current available balance.
 */
export async function createConfidentialWithdrawInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
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
}): Promise<InstructionPlan> {
    const [{ rawAmount, decimals, extensions }, decoded] = await Promise.all([
        resolveRawAmount(input.rpc, input.mint, input.amount),
        fetchToken(input.rpc, input.tokenAccount),
    ]);

    if (mintHasConfidentialMintBurnExtension(extensions)) {
        throw confidentialMintBurnConversionError(input.mint, 'confidential withdrawal', null);
    }
    const registeredElgamalPubkey = getConfidentialTransferAccountElgamalPubkey(decoded);
    if (registeredElgamalPubkey !== null) {
        assertConfidentialKeysMatchAccount(input.keys, registeredElgamalPubkey, `token account ${input.tokenAccount}`);
    }

    return getConfidentialWithdrawInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        mint: input.mint,
        tokenAccount: decoded.data,
        authority: toAuthoritySigner(input.authority),
        amount: rawAmount,
        decimals,
        elgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
    });
}
