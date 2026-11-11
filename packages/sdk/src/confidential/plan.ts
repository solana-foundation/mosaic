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
        // Version 1 only: reserve the resource-limit header fields while the
        // planner sizes messages, otherwise packing under-counts by the bytes
        // the real limits will occupy. Left off for version 0, where the
        // equivalent would be a ComputeBudget *instruction* the SDK has never
        // emitted and callers may not want.
        ...(version === 1 ? { onTransactionMessageUpdated: fillTransactionMessageProvisoryResourceLimits } : {}),
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
}): Promise<TransactionPlan> {
    return createConfidentialTransactionPlanner(input.feePayer, { version: input.version })(input.instructionPlan);
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
 * Version 0 and legacy messages get a compute-unit-limit *instruction*, which
 * adds bytes to an already-sized message — that is exactly the collision
 * `recordBackedProof` exists to work around. Version 1 messages get header
 * fields whose bytes the planner has already reserved, so nothing changes size.
 *
 * @throws If the message has no lifetime, or if simulation fails. For version 1
 * it also throws when the RPC omits `loadedAccountsDataSize` from the
 * simulation result, since version 1 cannot be sent without that limit.
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
    return estimateAndSet(transactionMessage, config);
}
