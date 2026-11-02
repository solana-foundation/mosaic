---
'@solana/mosaic-sdk': major
'@solana/mosaic-cli': major
---

Move to `@solana-program/token-2022@0.18.0` on Solana Kit v8, and adopt the remaining upstream confidential helpers

**Breaking:** the SDK and CLI now require `@solana/kit@^8` (from `^6`), along with `@solana/sysvars@^8`, `@solana-program/zk-elgamal-proof@^0.4.0`, `@solana-program/system@0.14.1` and `@solana-program/memo@0.13.1`. Consumers must upgrade Kit alongside this release.

**Breaking:** both packages now require Node.js 20.19 or later (the CLI previously declared 20.6). Kit 8.5 needs 20.18, and token-2022 0.18's confidential module loads the ESM-only `@noble/curves` 2.x, which CommonJS consumers can only `require()` from Node 20.19.

The main driver is staying on the supported Kit line: the whole `@solana-program/*` ecosystem has moved to Kit v8. The bump also brings the upstream `@solana-program/token-2022/confidential` helpers that the builders below now delegate to (fee-aware transfer, record-backed proofs, empty-account).

**`@solana-program/memo` is held at 0.13.1 on purpose**, even though 0.14.x is Kit-v8-native. 0.14.0 repointed `MEMO_PROGRAM_ADDRESS` from the Memo v3 program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) to the new Pinocchio Memo v4 program (`Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH`), which would have silently changed the on-chain program that `createTransferTransaction`'s optional memo targets. Memo v3 stays the default: it is what wallets, explorers and indexers parse today, and unlike v4 it is present in `solana-test-validator`'s genesis. Adopting Memo v4 will be its own, explicit change.

**New: opt-in record-backed range proofs.** `createConfidentialTransferInstructionPlan` and `createConfidentialWithdrawInstructionPlan` accept a `recordBackedProof` option that stages the batched range proof in an SPL Record account instead of passing it inline in the verify instruction's data.

Only a plain confidential transfer needs it, and only at version 0 through an executor that sets compute-unit limits (Kit's default does). Its inline range-proof transaction is 1207 bytes, too close to the 1232-byte limit to fit a compute-unit-limit instruction. Pass `recordBackedProof: {}` there and plan with `reserveComputeUnitLimit: true`, at the cost of extra transactions to create, write and close the record account. An inline withdraw already fits the instruction, so the option only adds transactions there.

**`createEmptyConfidentialAccountInstructionPlan` now delegates upstream** to `getEmptyConfidentialTransferAccountInstructionPlan` instead of hand-wiring a sibling `ZeroCiphertext` proof. Its `rpc` parameter now also requires `GetMinimumBalanceForRentExemptionApi` (matching every other confidential builder), and the emitted transaction shape changes: the proof is verified through a context-state account rather than as a sibling instruction at `proofInstructionOffset: -1`. The account-configured and keys-match-account fail-fasts are unchanged.

**`confidential/proof.ts` is deprecated.** Empty-account was its last in-SDK consumer, so no builder here constructs proofs by hand any more. The module stays exported for external callers who built their own flows on it, and is slated for removal in a future breaking release.

Key derivation is unchanged. token-2022 now ships its own `deriveConfidentialKeys` for the same `solana-conf-bal/v1` scheme, but this SDK keeps its local implementation: upstream returns plain bytes while every upstream plan helper requires live WASM `ElGamalKeypair`/`AeKey` objects, and the local version adds WASM `free()` hygiene and clearer signer-rejection diagnosis. A new conformance test asserts the two derive byte-identical keys, so they cannot silently diverge.
