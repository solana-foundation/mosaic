import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken, getConfidentialTransferInstructionPlan } from '@solana-program/token-2022';
import type { ConfidentialKeys } from './keys';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

/**
 * Reads the auditor ElGamal pubkey configured on the mint's
 * `ConfidentialTransferMint` extension (or `undefined` if none). When a mint has
 * an auditor, every confidential transfer must encrypt the amount to it, so this
 * is folded into the transfer automatically. Takes an already-decoded mint to
 * avoid a redundant fetch.
 */
function getMintAuditorElgamalPubkey(mint: DecodedMint): Address | undefined {
    if (mint.data.extensions.__option !== 'Some') {
        return undefined;
    }
    const ext = mint.data.extensions.value.find(
        (e): e is Extract<typeof e, { __kind: 'ConfidentialTransferMint' }> => e.__kind === 'ConfidentialTransferMint',
    );
    if (!ext || ext.auditorElgamalPubkey.__option !== 'Some') {
        return undefined;
    }
    return ext.auditorElgamalPubkey.value;
}

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return (
        token.data.extensions.__option === 'Some' &&
        token.data.extensions.value.some((e) => e.__kind === 'ConfidentialTransferAccount')
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
 * destination token account (for its ElGamal pubkey), and the mint (for decimals
 * and the optional auditor pubkey). The auditor is detected from the mint unless
 * overridden via `auditorElgamalPubkey`.
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

    // Fail fast with an actionable message rather than letting the upstream
    // extension extraction throw deep in the stack.
    if (!isConfidentialTransferAccount(destinationDecoded)) {
        throw new Error(
            `Destination token account ${input.destinationToken} is not configured for confidential transfers. ` +
                `Configure it first with createConfigureConfidentialAccountInstructionPlan.`,
        );
    }

    // Single mint fetch above feeds both the amount scaling and the auditor.
    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);
    const auditorElgamalPubkey = input.auditorElgamalPubkey ?? getMintAuditorElgamalPubkey(mintDecoded);

    return getConfidentialTransferInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        proofMode: 'context-state',
        mint: input.mint,
        sourceToken: input.sourceToken,
        sourceTokenAccount: sourceDecoded.data,
        destinationToken: input.destinationToken,
        destinationTokenAccount: destinationDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount: rawAmount,
        sourceElgamalKeypair: input.keys.elgamal,
        aesKey: input.keys.aes,
        auditorElgamalPubkey,
    });
}
