---
'@solana/mosaic-sdk': minor
---

Support confidential transfers on fee-bearing mints, and surface the readers and scaler callers were missing

**`createConfidentialTransferInstructionPlan` now handles `ConfidentialTransferFee` mints.** It previously threw on them, which left a hole in the SDK: `createCustomTokenInitTransaction` can _create_ such a mint (`enableConfidentialTransferFee`), and `Token.withConfidentialTransferFee` has always been part of the issuance builder — so the SDK could mint a token it then refused to transfer. Mints carrying `TransferFeeConfig` are now routed to upstream's `getConfidentialTransferWithFeeInstructionPlan`, matching the program, which requires `TransferWithFee` on such a mint. It verifies five proofs rather than the usual three and withholds the fee into the destination account.

That variant needs the current epoch to choose between the mint's older and newer fee schedule. It is read via `getEpochInfo` only on the fee path — a no-fee transfer still costs the same three account reads it always did — and is fetched in parallel with the account reads; a new optional `currentEpoch` input skips it. The fee-aware variant's batched range proof is too large to pass inline, so upstream **always** stages it in an SPL Record account: a fee-mint transfer costs the extra record create/write/close transactions whether or not `recordBackedProof` is passed, and the option only overrides the record's payer, authority and rent receiver there. One of the plan's version-0 transactions is exactly 1232 bytes, so to send it through an executor that sets compute-unit limits, plan with `reserveComputeUnitLimit: true` (or `version: 1`).

The fee schedule is fixed when the plan is built, so a transfer planned just before a scheduled fee change that lands after the epoch boundary is rejected on-chain, stranding its proof accounts' rent. When the builder fetches the epoch itself, it refuses to plan within `FEE_SCHEDULE_CHANGE_GUARD_SLOTS` (1500 slots, about 10 minutes, exported) of an epoch boundary where the fee changes. A caller-supplied `currentEpoch` skips that check and must be fresh.

**`createConfigureConfidentialAccountInstructionPlan` now sizes accounts for fee mints.** On a mint with `TransferFeeConfig`, Token-2022's `ConfigureAccount` also initializes `ConfidentialTransferFeeAmount` on the account, and a fee-aware transfer needs it on the destination. The builder previously reallocated only for `ConfidentialTransferAccount`, so configuring a holder account on such a mint failed and the fee-aware transfer above could not be reached end to end. It now reads the mint and reallocates for both extensions when `TransferFeeConfig` is present. Pass the new `includeConfidentialTransferFeeAmount` option to skip that mint read.

**New exports from `@solana/mosaic-sdk/confidential`:**

- `tokenAmountToRaw(amount, decimals)` — the validated decimal→raw scaler the builders use internally, for callers that scale amounts by the mint's decimals themselves. The only exported alternative, the root `decimalAmountToRaw`, silently truncates over-precision. This one rejects it, along with non-numeric input and results outside `(0, 2^64)`.
- `isSignerRejection` / `describeError` — tell "the user dismissed the wallet prompt" apart from "this wallet cannot sign the derivation message at all". `deriveConfidentialKeys` already makes that distinction internally; a UI wrapping its own signer needs it too.
- `mintHasTransferFeeConfig` — the extension that decides the fee-aware route, alongside the existing `mintHasConfidentialTransferFee`.
- `getConfidentialKeysElgamalAddress(keys)` — a key pair's ElGamal public key as the `Address` a token account or mint extension stores, e.g. for a mint's `withdrawWithheldAuthorityElGamalPubkey`.

**Docs.** The confidential guide in `packages/sdk/README.md` now covers the four credits toggles, the extension readers, the key/account assertion, the account-state and decryption helpers, the amount types, and the deprecation of `confidential/proof.ts` — all of which were exported but undocumented.

**Note on `createKeyPairMessageSigner`.** Its doc comment claimed it was how a CLI/Node caller feeds `deriveConfidentialKeys`, which was wrong — derivation takes a kit `MessagePartialSigner`, and a kit `KeyPairSigner` already is one. The function is unchanged (it builds the `SignMessage` shape the wallet-standard subpath is built on); only the misleading documentation is corrected.
