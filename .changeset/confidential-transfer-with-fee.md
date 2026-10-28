---
'@solana/mosaic-sdk': minor
---

Support confidential transfers on fee-bearing mints, and surface the readers and scaler callers were missing

**`createConfidentialTransferInstructionPlan` now handles `ConfidentialTransferFee` mints.** It previously threw on them, which left a hole in the SDK: `createCustomTokenInitTransaction` can _create_ such a mint (`enableConfidentialTransferFee`), and `Token.withConfidentialTransferFee` has always been part of the issuance builder — so the SDK could mint a token it then refused to transfer. Mints carrying `TransferFeeConfig` + `ConfidentialTransferFee` are now routed to upstream's `getConfidentialTransferWithFeeInstructionPlan`, which verifies the five proofs `TransferWithFee` needs rather than the usual three and withholds the fee into the destination account.

That variant needs the current epoch to choose between the mint's older and newer fee schedule. It is read via `getEpochInfo` only on the fee path — a no-fee transfer still costs the same three account reads it always did — and a new optional `currentEpoch` input skips the round trip. The upstream fee-aware helper takes the record-proof fields inline rather than having a separate `…WithRecord` twin, so `recordBackedProof` folds into the same call. A mint carrying `ConfidentialTransferFee` _without_ `TransferFeeConfig` is malformed and is now rejected by name, instead of surfacing as a generic missing-extension throw from inside proof generation.

**New exports from `@solana/mosaic-sdk/confidential`:**

- `tokenAmountToRaw(amount, decimals)` — the validated decimal→raw scaler the builders use internally. The two APIs that take **raw** units (`createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan` and `resyncSupply` on apply-pending-burn) told callers to scale by the mint's decimals themselves, while the only exported alternative, the root `decimalAmountToRaw`, silently truncates over-precision. This one rejects it, along with non-numeric input and results outside `(0, 2^64)`.
- `isSignerRejection` / `describeError` — tell "the user dismissed the wallet prompt" apart from "this wallet cannot sign the derivation message at all". `deriveConfidentialKeys` already makes that distinction internally; a UI wrapping its own signer needs it too.
- `mintHasTransferFeeConfig` — the plaintext-fee half of the pair above, alongside the existing `mintHasConfidentialTransferFee`.

**Docs.** The confidential guide in `packages/sdk/README.md` now covers the four credits toggles, the extension readers, the key/account and key/supply assertions, the account-state and decryption helpers, the amount types, and the deprecation of `confidential/proof.ts` — all of which were exported but undocumented.

**Note on `createKeyPairMessageSigner`.** Its doc comment claimed it was how a CLI/Node caller feeds `deriveConfidentialKeys`, which was wrong — derivation takes a kit `MessagePartialSigner`, and a kit `KeyPairSigner` already is one. The function is unchanged (it builds the `SignMessage` shape the wallet-standard subpath is built on); only the misleading documentation is corrected.
