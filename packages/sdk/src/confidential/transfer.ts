import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken } from '@solana-program/token-2022';
import {
    getConfidentialTransferInstructionPlan,
    getConfidentialTransferWithFeeInstructionPlan,
    getConfidentialTransferWithRecordInstructionPlan,
} from '@solana-program/token-2022/confidential';
import {
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
    mintHasConfidentialTransferFee,
    mintHasTransferFeeConfig,
} from './extensions.js';
import { assertConfidentialKeysMatchTokenAccount, type ConfidentialKeys } from './keys.js';
import {
    type RecordBackedProof,
    type TokenAmount,
    toRecordProofArgs,
    tokenAmountToRaw,
    toAuthoritySigner,
} from './util.js';

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
 * Mints that also carry `TransferFeeConfig` + `ConfidentialTransferFee` are
 * routed to the fee-aware variant instead, which verifies five proofs rather
 * than three and withholds the fee into the destination account. That variant
 * needs the current epoch to pick between the mint's older and newer fee
 * schedule; it is fetched only on that path, in parallel with the account
 * reads, so a no-fee transfer still costs the same three account reads it
 * always did. Its batched range proof is too large to pass inline, so upstream
 * always stages it in an SPL Record account — whether or not `recordBackedProof`
 * is passed.
 *
 * Even so, at version 0 one of the fee-aware plan's transactions fills the
 * 1232-byte limit exactly, so a compute-unit-limit instruction does not fit and
 * `recordBackedProof` cannot make room. Send it at version 0 without adding
 * compute-unit limits, or plan it with `version: 1`.
 *
 * The fee schedule is fixed at planning time, but the plan runs as several
 * transactions. If the mint has a fee change scheduled for the next epoch and
 * the transfer instruction lands after the boundary, the program checks the
 * proof against the newer schedule and rejects it, leaving the proof and record
 * accounts' rent to reclaim by hand. Avoid planning such transfers in the last
 * moments of the epoch before a scheduled change.
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
    /**
     * Current epoch, used only on a `ConfidentialTransferFee` mint to select the
     * older or newer transfer-fee schedule. Fetched via `getEpochInfo` when
     * omitted; pass it to save that round trip.
     */
    currentEpoch?: number | bigint;
    /**
     * Stage the batched range proof in an SPL Record account instead of inline in
     * the verify instruction data. Pass this (`{}` is enough) when sending with an
     * executor that sets compute-unit limits — see {@link RecordBackedProof}.
     *
     * On a `ConfidentialTransferFee` mint the proof is always record-backed; this
     * option then only overrides the record's payer, authority and rent receiver,
     * and does not make room for a compute-unit-limit instruction (see above).
     */
    recordBackedProof?: RecordBackedProof;
}): Promise<InstructionPlan> {
    const mintPromise = fetchMint(input.rpc, input.mint);
    // Chained off the mint fetch so the epoch read overlaps the token reads
    // rather than following them, and is never issued for a no-fee mint.
    const epochPromise =
        input.currentEpoch !== undefined
            ? Promise.resolve(input.currentEpoch)
            : mintPromise.then(mint =>
                  mintHasConfidentialTransferFee(mint)
                      ? input.rpc
                            .getEpochInfo()
                            .send()
                            .then(info => info.epoch)
                      : undefined,
              );
    const [mintDecoded, sourceDecoded, destinationDecoded, currentEpoch] = await Promise.all([
        mintPromise,
        fetchToken(input.rpc, input.sourceToken),
        fetchToken(input.rpc, input.destinationToken),
        epochPromise,
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

    // ...and a mint carrying `ConfidentialTransferFee` takes the fee-aware
    // variant. Token-2022 reads the basis points and maximum fee from
    // `TransferFeeConfig`, so both extensions must be present; a mint with only
    // one of them is malformed and gets a message naming the missing half rather
    // than upstream's generic missing-extension throw from inside proof
    // generation.
    const withFee = mintHasConfidentialTransferFee(mintDecoded);
    if (withFee && !mintHasTransferFeeConfig(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} carries the ConfidentialTransferFee extension without ` +
                `TransferFeeConfig; a fee-aware confidential transfer needs both.`,
        );
    }

    // The destination must be able to receive a confidential balance.
    if (!isConfidentialTransferAccount(destinationDecoded)) {
        throw new Error(
            `Destination token account ${input.destinationToken} is not configured for confidential transfers. ` +
                `Configure it first with createConfigureConfidentialAccountInstructionPlan.`,
        );
    }
    assertConfidentialKeysMatchTokenAccount(input.keys, sourceDecoded, `source token account ${input.sourceToken}`);

    // Single mint fetch above feeds both the amount scaling and the auditor: the
    // decoded mint is forwarded as `mintAccount` so the upstream helper resolves
    // the configured auditor without a redundant fetch.
    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    const args = {
        rpc: input.rpc,
        payer: input.payer,
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
    };

    // The fee-aware helper has no separate `…WithRecord` twin: it always stages
    // the range proof in a record account and takes the record fields inline, so
    // the record option only overrides its defaults here.
    if (withFee) {
        return getConfidentialTransferWithFeeInstructionPlan({
            ...args,
            ...(input.recordBackedProof !== undefined ? toRecordProofArgs(input.recordBackedProof) : {}),
            mintAccount: mintDecoded.data,
            // Always set on this path: supplied, or fetched because the mint has the fee extension.
            currentEpoch: currentEpoch!,
        });
    }

    if (input.recordBackedProof !== undefined) {
        return getConfidentialTransferWithRecordInstructionPlan({
            ...args,
            ...toRecordProofArgs(input.recordBackedProof),
        });
    }
    return getConfidentialTransferInstructionPlan(args);
}
