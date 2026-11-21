export {
    deriveConfidentialKeys,
    assertConfidentialKeysMatchAccount,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
    type ConfidentialKeys,
    type DeriveConfidentialKeysInput,
} from './keys.js';

export {
    createConfidentialTransactionPlanner,
    estimateAndSetConfidentialResourceLimits,
    planConfidentialInstructions,
    type ConfidentialPlannerOptions,
    type ConfidentialTransactionVersion,
} from './plan.js';

// `tokenAmountToRaw` is the validated decimal→raw scaler the builders use
// internally, exported for callers that scale amounts by the mint's decimals
// themselves. The root `decimalAmountToRaw` silently truncates over-precision;
// this one rejects it, along with non-numeric input and out-of-u64 results.
export { tokenAmountToRaw, type RecordBackedProof, type TokenAmount } from './util.js';

// A UI has to tell "the user dismissed the wallet prompt" from "this wallet
// cannot sign the derivation message at all" — the first is a no-op, the second
// needs an explanation. `deriveConfidentialKeys` already makes that distinction
// internally; these expose it to callers wrapping their own signer.
export { isSignerRejection, describeError } from './signer-errors.js';

// Extension readers. Every builder here fails fast on its own, but a caller that
// wants to check a mint or account *before* asking for keys — to decide which
// endpoint to offer, or to verify a wallet's keys still match an account — needs
// the same readers the builders use.
export {
    isConfidentialTransferMint,
    isConfidentialTransferAccount,
    getConfidentialTransferAccountElgamalPubkey,
    mintHasConfidentialTransferFee,
    mintHasTransferFeeConfig,
    type DecodedMint,
    type DecodedToken,
} from './extensions.js';

export {
    createEnableConfidentialCreditsInstructionPlan,
    createDisableConfidentialCreditsInstructionPlan,
    createEnableNonConfidentialCreditsInstructionPlan,
    createDisableNonConfidentialCreditsInstructionPlan,
    type CreditsInput,
} from './credits.js';

export { createConfidentialDepositInstructionPlan } from './deposit.js';

export {
    createConfigureConfidentialAccountInstructionPlan,
    createApproveConfidentialAccountInstructionPlan,
} from './configure-account.js';

export { createApplyConfidentialPendingBalanceInstructionPlan } from './apply-pending-balance.js';

export { createConfidentialWithdrawInstructionPlan } from './withdraw.js';

export { createConfidentialTransferInstructionPlan } from './transfer.js';

export { createEmptyConfidentialAccountInstructionPlan } from './empty-account.js';

// DEPRECATED. Since the 0.18.0 bump, `empty-account.ts` delegates to upstream's
// `getEmptyConfidentialTransferAccountInstructionPlan`, which was the last
// in-SDK consumer of this bespoke proof plumbing. Nothing in this SDK builds
// proofs by hand any more. Kept exported so external callers that wired their
// own flows keep working; slated for removal in a future breaking release.
export {
    buildProofVerificationIxs,
    buildPubkeyValidityProofIxs,
    buildZeroCiphertextProofIxs,
    buildWithdrawProofIxs,
    buildTransferProofIxs,
    buildCloseContextStateInstruction,
    type ProofData,
    type ProofMode,
    type ProofInstructions,
    type ProofWithMode,
} from './proof.js';

export {
    fetchConfidentialAccountState,
    decryptConfidentialBalances,
    type ConfidentialAccountState,
    type ConfidentialAccountCiphertexts,
    type ConfidentialDecryptedBalances,
    type FetchConfidentialAccountStateOptions,
} from './account-state.js';

// Account-level inspector (counterpart to root `inspectToken`). Surfaced from
// this WASM-bearing subpath rather than the root inspection barrel so root
// imports stay free of the `@solana/zk-sdk` dependency.
export {
    inspectConfidentialAccount,
    type ConfidentialAccountInfo,
    type InspectConfidentialAccountOptions,
} from '../inspection/inspect-confidential-account.js';
