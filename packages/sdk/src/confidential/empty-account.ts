import {
    type Address,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    nonDivisibleSequentialInstructionPlan,
} from '@solana/kit';
import { fetchToken } from '@solana-program/token-2022';
import { getEmptyConfidentialTransferAccountInstructionPlan } from '@solana-program/token-2022/confidential';
import { toSigner } from '../signers.js';
import { isConfidentialTransferAccount } from './extensions.js';
import { assertConfidentialKeysMatchTokenAccount, type ConfidentialKeys } from './keys.js';

/**
 * Empties a confidential token account's **available** balance so it can be
 * closed: it proves (via a `ZeroCiphertext` proof) that the available balance
 * ciphertext encrypts zero, then runs `EmptyConfidentialTransferAccount`.
 *
 * Wraps the official `getEmptyConfidentialTransferAccountInstructionPlan`, which
 * generates the zero-ciphertext proof and wires it through a context-state
 * account. The whole plan (create the context account, verify, empty, close it)
 * packs into a single transaction, so it lands or fails atomically. Upstream
 * returns a divisible plan, so it is wrapped as non-divisible here: composed
 * after another plan, the planner could otherwise put the proof setup into the
 * previous transaction's spare room and strand the context account's rent if
 * the empty transaction then fails.
 *
 * Reads and decodes the token account, and adds the Mosaic value-adds: an
 * account-configured fail-fast and a keys-match-account assertion, so a wrong
 * wallet is caught here rather than as an opaque on-chain proof rejection.
 *
 * The available balance must already be zero (run `withdraw` first); otherwise
 * the proof fails on-chain.
 */
export async function createEmptyConfidentialAccountInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
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
    // A key mismatch would only fail on-chain as an opaque proof rejection;
    // catching it here names the actual cause.
    assertConfidentialKeysMatchTokenAccount(input.keys, decoded, `token account ${input.tokenAccount}`);

    const plan = await getEmptyConfidentialTransferAccountInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        tokenAccount: decoded.data,
        authority: toSigner(input.authority),
        elgamalKeypair: input.keys.elgamal,
    });
    return nonDivisibleSequentialInstructionPlan([plan]);
}
