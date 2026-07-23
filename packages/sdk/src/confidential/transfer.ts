import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken } from '@solana-program/token-2022';
import { getConfidentialTransferInstructionPlan } from '@solana-program/token-2022/confidential';
import type { ConfidentialKeys } from './keys';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return (
        token.data.extensions.__option === 'Some' &&
        token.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferAccount')
    );
}

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferMint')
    );
}

/**
 * Whether a decoded mint carries the `ConfidentialTransferFee` extension. Such
 * mints require the fee-aware confidential transfer variant, which this helper
 * does not yet build.
 */
function mintHasConfidentialTransferFee(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferFee')
    );
}

/**
 * Confidentially transfers tokens from one account to another. Wraps the
 * official `getConfidentialTransferInstructionPlan`, which splits the amount into
 * lo/hi halves and generates + verifies the three required proofs (ciphertext
 * equality, grouped-ciphertext validity, batched range) via context-state
 * accounts, emitting the full setup → transfer → cleanup plan.
 *
 * Reads the source token account (for the current available balance), the
 * destination token account (for its ElGamal pubkey), and the mint (for decimals).
 * The decoded mint is forwarded to the upstream helper as `mintAccount`, which
 * resolves the configured auditor from it — unless overridden via
 * `auditorElgamalPubkey`.
 *
 * Note: this targets the standard (no-fee) confidential transfer. Mints that
 * also carry `TransferFeeConfig` + `ConfidentialTransferFee` need the fee-aware
 * variant — not yet wired here.
 */
export async function createConfidentialTransferInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The token mint. */
    mint: Address;
    /** Source confidential token account. */
    sourceToken: Address;
    /** Destination confidential token account. */
    destinationToken: Address;
    /** The source account authority (owner). A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to transfer — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
    /** ElGamal keypair + AES key for the source account. */
    keys: ConfidentialKeys;
    /** Override the auditor pubkey; defaults to the mint's configured auditor. */
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan> {
    const [mintDecoded, sourceDecoded, destinationDecoded] = await Promise.all([
        fetchMint(input.rpc, input.mint),
        fetchToken(input.rpc, input.sourceToken),
        fetchToken(input.rpc, input.destinationToken),
    ]);

    // Fail fast with actionable messages rather than letting the upstream
    // helpers throw deep in the stack. The mint must be confidential-transfer
    // configured...
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferMint extension).`,
        );
    }

    // ...and this helper only builds the standard (no-fee) confidential
    // transfer. A mint carrying `ConfidentialTransferFee` needs the fee-aware
    // variant, so fail fast rather than silently building a rejected plan.
    if (mintHasConfidentialTransferFee(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} is configured with confidential transfer fees; ` +
                `the fee-aware confidential transfer variant is not yet supported.`,
        );
    }

    // The destination must be able to receive a confidential balance.
    if (!isConfidentialTransferAccount(destinationDecoded)) {
        throw new Error(
            `Destination token account ${input.destinationToken} is not configured for confidential transfers. ` +
                `Configure it first with createConfigureConfidentialAccountInstructionPlan.`,
        );
    }

    // Single mint fetch above feeds both the amount scaling and the auditor: the
    // decoded mint is forwarded as `mintAccount` so the upstream helper resolves
    // the configured auditor without a redundant fetch (mirrors mint.ts/burn.ts).
    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    return getConfidentialTransferInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        proofMode: 'context-state',
        mint: input.mint,
        mintAccount: mintDecoded.data,
        sourceToken: input.sourceToken,
        sourceTokenAccount: sourceDecoded.data,
        destinationToken: input.destinationToken,
        destinationTokenAccount: destinationDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount: rawAmount,
        sourceElgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
        auditorElgamalPubkey: input.auditorElgamalPubkey,
    });
}
