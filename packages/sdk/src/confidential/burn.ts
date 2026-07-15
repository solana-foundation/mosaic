import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    singleInstructionPlan,
} from '@solana/kit';
import { fetchMint, fetchToken, getApplyConfidentialPendingBurnInstruction } from '@solana-program/token-2022';
import { getConfidentialBurnInstructionPlan } from '@solana-program/token-2022/confidential';
import { type ConfidentialKeys, decryptAesBalance, elGamalCiphertextEncrypts } from './keys';
import {
    getConfidentialMintBurnExtension,
    getConfidentialTransferAccountExtension,
    isConfidentialTransferMint,
} from './mint-burn-util';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

/**
 * Confidentially **burns** tokens from an account's available confidential
 * balance, decreasing the mint's encrypted total supply (recorded in the mint's
 * `pending_burn` accumulator until {@link createApplyConfidentialPendingBurnInstructionPlan}
 * is run). The burn amount stays encrypted on-chain.
 *
 * Wraps the official `getConfidentialBurnInstructionPlan`, which generates the
 * three proofs (equality, grouped-ciphertext validity, U128 range) and wires them
 * via context-state accounts, so the plan spans multiple transactions (proof
 * setup → burn → cleanup). Authored by the **account owner** (who holds the
 * account keys); the mint's supply pubkey + auditor are read from the mint.
 *
 * This wrapper adds the Mosaic value-adds: decimal `TokenAmount` handling, the
 * both-extensions-required + account-configured fail-fast, and the
 * decryptable-balance **drift guard** (fails fast if the account's decryptable
 * available balance is out of sync with its on-chain ElGamal ciphertext, which
 * would otherwise yield a proof the chain rejects with an opaque error).
 */
export async function createConfidentialBurnInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The source confidential token account to burn from. */
    tokenAccount: Address;
    /** The account owner. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to burn — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
    /** The account owner's ElGamal keypair + AES key. */
    keys: ConfidentialKeys;
    /** Override the auditor pubkey; defaults to the mint's configured auditor. */
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan> {
    const [mintDecoded, tokenDecoded] = await Promise.all([
        fetchMint(input.rpc, input.mint),
        fetchToken(input.rpc, input.tokenAccount),
    ]);

    // Fail fast: the mint must be confidential-mint/burn configured, and (since
    // the burned balance is confidential) also confidential-transfer configured.
    getConfidentialMintBurnExtension(mintDecoded, input.mint);
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} has ConfidentialMintBurn but not ConfidentialTransferMint; ` +
                `both are required for confidential burn.`,
        );
    }
    // Throws with an actionable message if the account is not configured.
    const accountExt = getConfidentialTransferAccountExtension(tokenDecoded, input.tokenAccount);

    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);
    const currentAvailableBalance = decryptAesBalance(
        input.keys.aes,
        new Uint8Array(accountExt.decryptableAvailableBalance),
    );
    const currentAvailableBalanceCiphertext = new Uint8Array(accountExt.availableBalance);

    // The equality proof binds the AES-decrypted available balance to the account's
    // ElGamal available-balance ciphertext; if they have drifted (e.g. a stale
    // decryptable balance, or the wrong account keys), the chain would reject the
    // proof with an opaque ZK error — fail fast with an actionable one instead.
    if (!elGamalCiphertextEncrypts(input.keys.elgamal, currentAvailableBalanceCiphertext, currentAvailableBalance)) {
        throw new Error(
            `Token account ${input.tokenAccount}'s decryptable available balance is out of sync with its ` +
                `on-chain ElGamal balance ciphertext (apply any pending balance first, or check the account keys) ` +
                `before burning.`,
        );
    }

    return getConfidentialBurnInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        proofMode: 'context-state',
        token: input.tokenAccount,
        mint: input.mint,
        sourceTokenAccount: tokenDecoded.data,
        mintAccount: mintDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount: rawAmount,
        sourceElgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
        auditorElgamalPubkey: input.auditorElgamalPubkey,
    });
}

/**
 * Applies the mint's accumulated **pending burn** into its confidential supply,
 * finalizing prior confidential burns on the supply side. Signed by the mint
 * authority. No proof is required — returns a `singleInstructionPlan`.
 */
export function createApplyConfidentialPendingBurnInstructionPlan(input: {
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
}): InstructionPlan {
    return singleInstructionPlan(
        getApplyConfidentialPendingBurnInstruction({
            mint: input.mint,
            authority: toAuthoritySigner(input.authority),
        }),
    );
}
