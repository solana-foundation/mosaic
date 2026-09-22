import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchToken } from '@solana-program/token-2022';
import { getEmptyConfidentialTransferAccountInstructionPlan } from '@solana-program/token-2022/confidential';
import { getConfidentialTransferAccountElgamalPubkey, isConfidentialTransferAccount } from './extensions.js';
import { assertConfidentialKeysMatchAccount, type ConfidentialKeys } from './keys.js';
import { toAuthoritySigner } from './util.js';

/**
 * Empties a confidential token account's **available** balance so it can be
 * closed: it proves (via a `ZeroCiphertext` proof) that the available balance
 * ciphertext encrypts zero, then runs `EmptyConfidentialTransferAccount`.
 *
 * Wraps the official `getEmptyConfidentialTransferAccountInstructionPlan`, which
 * generates the zero-ciphertext proof and wires it through a context-state
 * account, so the returned plan may span multiple transactions (proof setup →
 * empty → cleanup).
 *
 * Reads and decodes the token account, and adds the Mosaic value-adds: an
 * account-configured fail-fast and a keys-match-account assertion, so a wrong
 * wallet is caught here rather than as an opaque on-chain proof rejection.
 *
 * The available balance must already be zero (run `withdraw` first); otherwise
 * the proof fails on-chain.
 */
export async function createEmptyConfidentialAccountInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The confidential token account (ATA) to empty. */
    tokenAccount: Address;
    /** The account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** ElGamal keypair + AES key for this account. */
    keys: ConfidentialKeys;
}): Promise<InstructionPlan> {
    const decoded = await fetchToken(input.rpc, input.tokenAccount);

    if (!isConfidentialTransferAccount(decoded)) {
        throw new Error(
            `Token account ${input.tokenAccount} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
                `createConfigureConfidentialAccountInstructionPlan.`,
        );
    }
    // The plan funds a rent-paying context-state account in a setup transaction
    // before the empty itself reaches the chain, so catching a key mismatch here
    // avoids failing the empty *and* skipping the cleanup that reclaims that rent.
    const registeredElgamalPubkey = getConfidentialTransferAccountElgamalPubkey(decoded);
    if (registeredElgamalPubkey !== null) {
        assertConfidentialKeysMatchAccount(input.keys, registeredElgamalPubkey, `token account ${input.tokenAccount}`);
    }

    return getEmptyConfidentialTransferAccountInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        tokenAccount: decoded.data,
        authority: toAuthoritySigner(input.authority),
        elgamalKeypair: input.keys.elgamal,
    });
}
