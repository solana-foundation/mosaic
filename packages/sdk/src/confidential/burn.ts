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
import type { ConfidentialKeys } from './keys';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

/** Whether a decoded mint carries the `ConfidentialMintBurn` extension. */
function isConfidentialMintBurn(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialMintBurn')
    );
}

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferMint')
    );
}

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return (
        token.data.extensions.__option === 'Some' &&
        token.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferAccount')
    );
}

/**
 * Confidentially **burns** tokens from an account's available confidential
 * balance, decreasing the mint's encrypted total supply (recorded in the mint's
 * `pending_burn` accumulator until {@link createApplyConfidentialPendingBurnInstructionPlan}
 * is run). The burn amount stays encrypted on-chain.
 *
 * Wraps the official `getConfidentialBurnInstructionPlan`, which generates the
 * three required proofs (equality, grouped-ciphertext validity, U128 range) and
 * wires them through context-state accounts, so the plan spans multiple
 * transactions (proof setup → burn → cleanup). Authored by the **account owner**
 * (who holds the account keys); the mint's supply pubkey + auditor are read from
 * the mint by the upstream helper.
 *
 * Reads the mint (for decimals) and the source account, and adds the Mosaic
 * value-adds: decimal `TokenAmount` handling and a both-extensions-required +
 * account-configured fail-fast.
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

    // Fail fast with actionable messages rather than letting the upstream helper
    // throw deep in the stack. The mint must be confidential-mint/burn configured,
    // and (since the burned balance is confidential) also confidential-transfer
    // configured; the account must be confidential-transfer configured.
    if (!isConfidentialMintBurn(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} is not configured for confidential mint/burn ` +
                `(missing the ConfidentialMintBurn extension).`,
        );
    }
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} has ConfidentialMintBurn but not ConfidentialTransferMint; ` +
                `both are required for confidential burn.`,
        );
    }
    if (!isConfidentialTransferAccount(tokenDecoded)) {
        throw new Error(
            `Token account ${input.tokenAccount} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
                `createConfigureConfidentialAccountInstructionPlan.`,
        );
    }

    const amount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    return getConfidentialBurnInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        token: input.tokenAccount,
        mint: input.mint,
        mintAccount: mintDecoded.data,
        sourceTokenAccount: tokenDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount,
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
