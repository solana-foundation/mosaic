import {
    type Commitment,
    type InstructionPlan,
    type Rpc,
    type SimulateTransactionApi,
    type Slot,
    type TransactionMessage,
    type TransactionMessageWithFeePayer,
    type TransactionPlan,
    type TransactionPlanner,
    type TransactionSigner,
    createTransactionMessage,
    createTransactionPlanner,
    estimateAndSetResourceLimitsFactory,
    estimateResourceLimitsFactory,
    fillTransactionMessageProvisoryResourceLimits,
    getTransactionMessageSize,
    getTransactionMessageSizeLimit,
    pipe,
    setTransactionMessageFeePayerSigner,
} from '@solana/kit';

/**
 * Confidential-transfer operations return a kit `InstructionPlan` rather than a
 * single `FullTransaction`, because several of them (configure, withdraw,
 * transfer) span multiple transactions: zero-knowledge proofs are verified into
 * dedicated context-state accounts in setup transactions, the token instruction
 * then references them, and a cleanup transaction reclaims the rent.
 *
 * This module turns those plans into concrete, fee-payer-bound transaction
 * messages. It stays "build only" — it does **not** fetch a blockhash, sign, or
 * send. The caller adds the lifetime and signs/sends each message in the
 * returned {@link TransactionPlan} (or drives it with kit's
 * `createTransactionPlanExecutor`).
 *
 * Messages are packed as version-0 transactions by default. Pass `version: 1` to
 * pack them as [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md)
 * transactions instead, which raises the per-transaction budget from 1232 to
 * 4096 bytes and therefore folds proof setup, the token instruction and cleanup
 * into far fewer transactions. See {@link ConfidentialPlannerOptions} for what
 * that choice obliges the caller to do.
 */

/**
 * Transaction format the confidential planner packs into.
 *
 * - `0` — the default. Universally accepted; 1232-byte messages.
 * - `1` — SIMD-0385. 4096-byte messages, no address lookup tables, and resource
 *   limits carried in header fields rather than ComputeBudget instructions.
 *   Requires Agave ≥ 4.2.2 on the RPC (and on any wallet/relayer in the path);
 *   the `txv1` feature gate is live on mainnet, devnet and testnet.
 */
export type ConfidentialTransactionVersion = 0 | 1;

/** Options for {@link createConfidentialTransactionPlanner}. */
export type ConfidentialPlannerOptions = {
    /**
     * Transaction format to pack into. Defaults to `0`.
     *
     * **Choosing `1` makes resource limits your responsibility.** Under legacy
     * and version-0 transactions an absent compute-unit limit falls back to the
     * runtime default of 200k CUs per instruction. Version 1 has no such
     * fallback: `computeUnitLimit` and `loadedAccountsDataSizeLimit` are header
     * fields that **default to zero**, so a message sent without them is
     * budgeted 0 CUs and 0 loaded-account bytes and fails on chain.
     *
     * The planner fills both with kit's *provisory* value (0) while packing, so
     * the fields occupy their real wire bytes and the size accounting is
     * correct. Replacing those provisory values with real estimates is the send
     * path's job — see {@link estimateAndSetConfidentialResourceLimits}.
     */
    version?: ConfidentialTransactionVersion;
    /**
     * Version 0 only (version 1 always reserves its header fields). Reserve a
     * compute-unit-limit instruction in every message while packing, so an
     * executor that sets compute-unit limits — kit's default, or
     * {@link estimateAndSetConfidentialResourceLimits} — only rewrites its value
     * and never grows a message past 1232 bytes. Defaults to `false`, which packs
     * without it as the SDK always has.
     *
     * With it on, a fee-mint confidential transfer and an inline withdraw both
     * plan cleanly at version 0. A plain transfer's inline range proof leaves no
     * room for the instruction, so planning it fails up front with a capacity
     * error; pass `recordBackedProof` to that builder, or plan at version 1.
     */
    reserveComputeUnitLimit?: boolean;
};

/**
 * Builds a kit {@link TransactionPlanner} that packs a confidential
 * `InstructionPlan` into transaction messages, each paid for by `feePayer`.
 *
 * The transaction version is an option rather than a fixed choice because it is
 * a wire-compatibility decision that belongs to the caller — their RPC provider,
 * their wallet, their multisig — not to the SDK.
 */
export function createConfidentialTransactionPlanner(
    feePayer: TransactionSigner,
    options: ConfidentialPlannerOptions = {},
): TransactionPlanner {
    const version = options.version ?? 0;
    return createTransactionPlanner({
        createTransactionMessage: () =>
            pipe(
                // Branch on the literal rather than passing the `0 | 1` union
                // through, so each message keeps its own precise version type.
                version === 1 ? createTransactionMessage({ version: 1 }) : createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(feePayer, m),
            ),
        // Reserve the resource limits while the planner sizes messages, otherwise
        // packing under-counts by the bytes the real limits will occupy. Always
        // on for version 1 (header fields). Opt-in for version 0, where it is a
        // ComputeBudget *instruction* that callers who send without limits do
        // not want.
        ...(version === 1 || options.reserveComputeUnitLimit
            ? { onTransactionMessageUpdated: fillTransactionMessageProvisoryResourceLimits }
            : {}),
    });
}

/**
 * Convenience wrapper: plans `instructionPlan` into a {@link TransactionPlan} of
 * fee-payer-bound messages (no blockhash, unsigned). Equivalent to
 * `createConfidentialTransactionPlanner(feePayer, options)(instructionPlan)`.
 */
export async function planConfidentialInstructions(input: {
    instructionPlan: InstructionPlan;
    feePayer: TransactionSigner;
    /** See {@link ConfidentialPlannerOptions.version}. Defaults to `0`. */
    version?: ConfidentialTransactionVersion;
    /** See {@link ConfidentialPlannerOptions.reserveComputeUnitLimit}. Defaults to `false`. */
    reserveComputeUnitLimit?: boolean;
}): Promise<TransactionPlan> {
    const { instructionPlan, feePayer, ...options } = input;
    return createConfidentialTransactionPlanner(feePayer, options)(instructionPlan);
}

/**
 * Simulates `transactionMessage` and writes the resulting compute-unit and
 * loaded-accounts-data-size limits onto it, replacing the provisory zeros a
 * version-1 planner left behind.
 *
 * **When to call it.** Per transaction, at send time — after the lifetime is
 * set and immediately before signing. Not once over the whole plan up front,
 * for two reasons:
 *
 * 1. Simulation compiles the message, which requires a blockhash or durable
 *    nonce lifetime. Planned messages deliberately have neither.
 * 2. A confidential plan is a *sequence*: the transfer instruction reads proof
 *    context-state accounts that the plan's own earlier transactions create.
 *    Simulating it before those land fails on a missing account.
 *
 * Limits already set to an explicit (non-provisory, non-maximum) value are left
 * alone, so a caller that knows its own budget can pre-set one and this call
 * becomes a no-op for that field.
 *
 * Version 0 and legacy messages get a compute-unit-limit *instruction*. If the
 * planner reserved it (`reserveComputeUnitLimit`), only its value changes;
 * otherwise it adds bytes to an already-sized message and can push it past the
 * size limit. Version 1 messages get header fields whose bytes the planner has
 * already reserved, so nothing changes size.
 *
 * @throws If the message has no lifetime, or if simulation fails. For version 1
 * it also throws when the RPC omits `loadedAccountsDataSize` from the
 * simulation result, since version 1 cannot be sent without that limit. It also
 * throws when the message with its limits no longer fits the transaction size
 * limit, naming `reserveComputeUnitLimit` as the fix.
 */
export async function estimateAndSetConfidentialResourceLimits<
    TTransactionMessage extends TransactionMessage & TransactionMessageWithFeePayer,
>(input: {
    rpc: Rpc<SimulateTransactionApi>;
    transactionMessage: TTransactionMessage;
    abortSignal?: AbortSignal;
    commitment?: Commitment;
    minContextSlot?: Slot;
}): Promise<TTransactionMessage> {
    const { rpc, transactionMessage, ...config } = input;
    if (!('lifetimeConstraint' in transactionMessage)) {
        throw new Error(
            'Cannot estimate resource limits for a transaction message without a lifetime — ' +
                'set a blockhash (or durable nonce) on the planned message first.',
        );
    }
    const estimateAndSet = estimateAndSetResourceLimitsFactory(estimateResourceLimitsFactory({ rpc }));
    const withLimits = await estimateAndSet(transactionMessage, config);
    const size = getTransactionMessageSize(withLimits);
    const limit = getTransactionMessageSizeLimit(withLimits);
    if (size > limit) {
        throw new Error(
            `Adding resource limits grew this transaction message to ${size} bytes, over the ${limit}-byte limit. ` +
                `Plan it with \`reserveComputeUnitLimit: true\` (or \`version: 1\`) so the planner leaves room for them.`,
        );
    }
    return withLimits;
}
