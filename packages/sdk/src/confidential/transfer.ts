import { type Address, type InstructionPlan, type Rpc, type SolanaRpcApi, type TransactionSigner } from '@solana/kit';
import { fetchMint, fetchToken } from '@solana-program/token-2022';
import {
    getConfidentialTransferInstructionPlan,
    getConfidentialTransferWithFeeInstructionPlan,
    getConfidentialTransferWithRecordInstructionPlan,
} from '@solana-program/token-2022/confidential';
import { toSigner } from '../signers.js';
import {
    type DecodedMint,
    getMintTransferFeeConfig,
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
    mintHasTransferFeeConfig,
} from './extensions.js';
import { assertConfidentialKeysMatchTokenAccount, type ConfidentialKeys } from './keys.js';
import { type RecordBackedProof, type TokenAmount, tokenAmountToRaw } from './util.js';

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
 * Mints that also carry `TransferFeeConfig` are routed to the fee-aware variant
 * instead, matching the program, which requires `TransferWithFee` whenever the
 * mint has a fee config. (Token-2022 only lets a confidential mint have a fee
 * config together with `ConfidentialTransferFee`, so such a mint always has
 * both.) The fee-aware variant verifies five proofs rather than three and
 * withholds the fee into the destination account. It needs the current epoch to
 * pick between the mint's older and newer fee schedule; that is fetched only on
 * this path, in parallel with the account reads, so a no-fee transfer still
 * costs the same three account reads it always did. Its batched range proof is
 * too large to pass inline, so upstream always stages it in an SPL Record
 * account — whether or not `recordBackedProof` is passed.
 *
 * At version 0 one of the fee-aware plan's transactions fills the 1232-byte
 * limit exactly. To send it through an executor that sets compute-unit limits,
 * plan with `reserveComputeUnitLimit: true` (or `version: 1`) so the planner
 * leaves room for the limit — see `createConfidentialTransactionPlanner`.
 *
 * The fee schedule is fixed at planning time, but the plan runs as several
 * transactions. If the mint has a fee change taking effect at the next epoch and
 * the transfer instruction lands after the boundary, the program checks the
 * proof against the newer schedule and rejects it, leaving the proof and record
 * accounts' rent to reclaim by hand. When this builder fetches the epoch itself
 * it therefore refuses to plan a transfer within
 * {@link FEE_SCHEDULE_CHANGE_GUARD_SLOTS} slots of such a boundary. A
 * caller-supplied `currentEpoch` skips that check, and a stale one picks the
 * wrong schedule outright, so pass it only when it is fresh.
 */
export async function createConfidentialTransferInstructionPlan(input: {
    rpc: Rpc<SolanaRpcApi>;
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
     * Current epoch, used only on a fee-bearing mint to select the older or newer
     * transfer-fee schedule. Fetched via `getEpochInfo` when omitted; pass it to
     * save that round trip. A supplied epoch skips the scheduled-fee-change guard
     * described above, and a stale one makes the proofs target the wrong
     * schedule, so it must be current.
     */
    currentEpoch?: number | bigint;
    /**
     * Stage the batched range proof in an SPL Record account instead of inline in
     * the verify instruction data. Pass this (`{}` is enough) when sending at
     * version 0 with an executor that sets compute-unit limits, and plan with
     * `reserveComputeUnitLimit` — see {@link RecordBackedProof}.
     *
     * On a fee-bearing mint the proof is always record-backed; this option then
     * only overrides the record's payer, authority and rent receiver, and does not
     * make room for a compute-unit-limit instruction (see above).
     */
    recordBackedProof?: RecordBackedProof;
}): Promise<InstructionPlan> {
    const mintPromise = fetchMint(input.rpc, input.mint);
    // Chained off the mint fetch so the epoch read overlaps the token reads
    // rather than following them, and is never issued for a no-fee mint.
    const epochInfoPromise =
        input.currentEpoch !== undefined
            ? Promise.resolve(undefined)
            : mintPromise.then(mint => (mintHasTransferFeeConfig(mint) ? input.rpc.getEpochInfo().send() : undefined));
    const [mintDecoded, sourceDecoded, destinationDecoded, epochInfo] = await Promise.all([
        mintPromise,
        fetchToken(input.rpc, input.sourceToken),
        fetchToken(input.rpc, input.destinationToken),
        epochInfoPromise,
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

    // ...and, like the program, a mint with a fee config takes the fee-aware variant.
    const withFee = mintHasTransferFeeConfig(mintDecoded);
    if (withFee && epochInfo !== undefined) {
        assertNoImminentFeeScheduleChange(input.mint, mintDecoded, epochInfo);
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
        authority: toSigner(input.authority),
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
            ...input.recordBackedProof,
            // Always set on this path: supplied, or fetched because the mint has a fee config.
            currentEpoch: input.currentEpoch ?? epochInfo!.epoch,
        });
    }

    if (input.recordBackedProof !== undefined) {
        return getConfidentialTransferWithRecordInstructionPlan({ ...args, ...input.recordBackedProof });
    }
    return getConfidentialTransferInstructionPlan(args);
}

/**
 * How close to an epoch boundary (in slots, ~10 minutes) the fee-aware transfer
 * refuses to plan when the mint's fee schedule changes at that boundary. A
 * version-0 fee-mint plan is six or seven transactions sent one after another,
 * and the transfer instruction must land before the boundary for its proofs to
 * match the schedule they were built against.
 */
export const FEE_SCHEDULE_CHANGE_GUARD_SLOTS = 1500n;

/**
 * Throws when the mint's newer transfer-fee schedule takes effect at the next
 * epoch, differs from the one in force now, and that epoch starts within
 * {@link FEE_SCHEDULE_CHANGE_GUARD_SLOTS} slots.
 */
function assertNoImminentFeeScheduleChange(
    mint: Address,
    mintDecoded: DecodedMint,
    epochInfo: { epoch: bigint; slotIndex: bigint; slotsInEpoch: bigint },
): void {
    const config = getMintTransferFeeConfig(mintDecoded);
    if (!config) {
        return;
    }
    const { olderTransferFee: older, newerTransferFee: newer } = config;
    const scheduleChanges =
        older.transferFeeBasisPoints !== newer.transferFeeBasisPoints || older.maximumFee !== newer.maximumFee;
    const slotsLeft = epochInfo.slotsInEpoch - epochInfo.slotIndex;
    if (scheduleChanges && newer.epoch === epochInfo.epoch + 1n && slotsLeft <= FEE_SCHEDULE_CHANGE_GUARD_SLOTS) {
        throw new Error(
            `Mint ${mint}'s transfer fee changes at epoch ${newer.epoch}, which starts in ${slotsLeft} slots. ` +
                `A confidential transfer planned now would carry proofs for the current fee and fail if it ` +
                `lands after the change, stranding its proof accounts' rent. Retry after the epoch boundary.`,
        );
    }
}
