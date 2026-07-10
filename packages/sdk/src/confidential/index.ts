export {
    deriveConfidentialKeys,
    deriveConfidentialKeysForOwnerMint,
    deriveConfidentialSupplyKeys,
    getConfidentialMintBurnInit,
    createKeyPairMessageSigner,
    freeConfidentialKeys,
    decryptAesBalance,
    decryptElGamalBalance,
    type SignMessage,
    type ConfidentialKeys,
    type DeriveConfidentialKeysInput,
    type DeriveConfidentialKeysForOwnerMintInput,
    type DeriveConfidentialSupplyKeysInput,
    type ConfidentialMintBurnInit,
} from './keys';

export { createConfidentialTransactionPlanner, planConfidentialInstructions } from './plan';

export { type TokenAmount } from './util';

export {
    createEnableConfidentialCreditsInstructionPlan,
    createDisableConfidentialCreditsInstructionPlan,
    createEnableNonConfidentialCreditsInstructionPlan,
    createDisableNonConfidentialCreditsInstructionPlan,
    type CreditsInput,
} from './credits';

export { createConfidentialDepositInstructionPlan } from './deposit';

export {
    createConfigureConfidentialAccountInstructionPlan,
    createApproveConfidentialAccountInstructionPlan,
} from './configure-account';

export { createApplyConfidentialPendingBalanceInstructionPlan } from './apply-pending-balance';

export { createConfidentialWithdrawInstructionPlan } from './withdraw';

export { createConfidentialTransferInstructionPlan } from './transfer';

export { createEmptyConfidentialAccountInstructionPlan } from './empty-account';

export { createConfidentialMintInstructionPlan } from './mint';

export { createConfidentialBurnInstructionPlan, createApplyConfidentialPendingBurnInstructionPlan } from './burn';

export { createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan } from './supply';

export {
    buildProofVerificationIxs,
    buildPubkeyValidityProofIxs,
    buildZeroCiphertextProofIxs,
    buildWithdrawProofIxs,
    buildTransferProofIxs,
    buildMintBurnProofIxs,
    buildCloseContextStateInstruction,
    type ProofData,
    type ProofMode,
    type ProofInstructions,
    type ProofWithMode,
} from './proof';

export {
    buildMintProofData,
    buildBurnProofData,
    type MintBurnProofData,
    type BuildMintProofDataInput,
    type BuildBurnProofDataInput,
} from './mint-burn-proof';

export {
    fetchConfidentialAccountState,
    decryptConfidentialBalances,
    type ConfidentialAccountState,
    type ConfidentialAccountCiphertexts,
    type ConfidentialDecryptedBalances,
    type FetchConfidentialAccountStateOptions,
} from './account-state';

// Account-level inspector (counterpart to root `inspectToken`). Surfaced from
// this WASM-bearing subpath rather than the root inspection barrel so root
// imports stay free of the `@solana/zk-sdk` dependency.
export {
    inspectConfidentialAccount,
    type ConfidentialAccountInfo,
    type InspectConfidentialAccountOptions,
} from '../inspection/inspect-confidential-account';
