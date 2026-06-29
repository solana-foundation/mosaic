import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { fetchToken, getApplyConfidentialPendingBalanceInstructionFromToken } from '@solana-program/token-2022';
import type { ConfidentialKeys } from './keys';
import { toAuthoritySigner } from './util';

/**
 * Applies the account's **pending** confidential balance into its **available**
 * confidential balance. The official helper decrypts the current pending balance
 * locally (with the ElGamal secret key), re-encrypts the new available balance
 * (with the AES key), and emits a single `ApplyPendingBalance` instruction that
 * carries the expected credit counter — so no on-chain proof is needed.
 *
 * Fetches and decodes the token account to read the current ciphertexts.
 * Returns a `singleInstructionPlan`.
 */
export async function createApplyConfidentialPendingBalanceInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
    /** The confidential token account (ATA). */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** ElGamal keypair + AES key for this account. */
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const decoded = await fetchToken(input.rpc, input.tokenAccount);

    const elgamalSecretKey = input.keys.elgamal.secret();
    try {
        const instruction = getApplyConfidentialPendingBalanceInstructionFromToken({
            token: input.tokenAccount,
            tokenAccount: decoded.data,
            authority: toAuthoritySigner(input.authority),
            elgamalSecretKey,
            aesKey: input.keys.aes,
        });
        return singleInstructionPlan(instruction);
    } finally {
        elgamalSecretKey.free?.();
    }
}
