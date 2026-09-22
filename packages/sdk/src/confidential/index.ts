export {
    deriveConfidentialKeys,
    getConfidentialMintBurnInit,
    assertConfidentialKeysMatchAccount,
    assertConfidentialKeysMatchSupply,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
    type ConfidentialKeys,
    type DeriveConfidentialKeysInput,
    type ConfidentialMintBurnInit,
} from './keys.js';

export {
    createConfidentialTransactionPlanner,
    estimateAndSetConfidentialResourceLimits,
    planConfidentialInstructions,
    type ConfidentialPlannerOptions,
    type ConfidentialTransactionVersion,
} from './plan.js';

export { type RecordBackedProof, type TokenAmount } from './util.js';

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

export { createConfidentialMintInstructionPlan } from './mint.js';

// Type-only export form: `export { type X } from '...'` is NOT fully erased —
// it emits `export {} from '../issuance/create-mint.js'`, a runtime side-effect
// import that pulls the whole issuance module into this subpath entrypoint.
export type { ConfidentialMintBurnOptions } from '../issuance/create-mint.js';

export { createConfidentialBurnInstructionPlan, createApplyConfidentialPendingBurnInstructionPlan } from './burn.js';

export { createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan } from './supply.js';

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
