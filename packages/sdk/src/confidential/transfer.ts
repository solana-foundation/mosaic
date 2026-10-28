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
    getConfidentialTransferAccountElgamalPubkey,
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
    mintHasConfidentialTransferFee,
    mintHasTransferFeeConfig,
} from './extensions.js';
import { assertConfidentialKeysMatchAccount, type ConfidentialKeys } from './keys.js';
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
 * schedule; it is fetched only on that path, so a no-fee transfer still costs
 * the same three account reads it always did.
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
     */
    recordBackedProof?: RecordBackedProof;
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
    const sourceElgamalPubkey = getConfidentialTransferAccountElgamalPubkey(sourceDecoded);
    if (sourceElgamalPubkey !== null) {
        assertConfidentialKeysMatchAccount(
            input.keys,
            sourceElgamalPubkey,
            `source token account ${input.sourceToken}`,
        );
    }

    // Single mint fetch above feeds both the amount scaling and the auditor: the
    // decoded mint is forwarded as `mintAccount` so the upstream helper resolves
    // the configured auditor without a redundant fetch (mirrors mint.ts/burn.ts).
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

    // The fee-aware helper has no separate `…WithRecord` twin — it takes the
    // record fields inline — so the record option folds into the same call.
    if (withFee) {
        return getConfidentialTransferWithFeeInstructionPlan({
            ...args,
            ...(input.recordBackedProof !== undefined ? toRecordProofArgs(input.recordBackedProof) : {}),
            mintAccount: mintDecoded.data,
            currentEpoch: input.currentEpoch ?? (await input.rpc.getEpochInfo().send()).epoch,
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
