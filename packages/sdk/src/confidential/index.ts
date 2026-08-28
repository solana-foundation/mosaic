export {
    deriveConfidentialKeys,
    deriveConfidentialKeysForOwnerMint,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
    type ConfidentialKeys,
    type DeriveConfidentialKeysInput,
    type DeriveConfidentialKeysForOwnerMintInput,
} from './keys.js';

export { createConfidentialTransactionPlanner, planConfidentialInstructions } from './plan.js';

export { type TokenAmount } from './util.js';

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
