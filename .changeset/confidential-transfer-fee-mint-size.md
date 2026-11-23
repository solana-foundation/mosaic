---
'@solana/mosaic-sdk': patch
---

Fix creating mints with the confidential transfer fee. `Token.withConfidentialTransferFee` kept its config outside the extension list, so `getMintSize` never reserved space for `ConfidentialTransferFeeConfig`, and its initializer failed on-chain with `InvalidAccountData`. No fee-bearing confidential mint could be created, through the builder or through `createCustomTokenInitTransaction({ enableConfidentialTransferFee })`. The extension is now registered like the others: the mint account is sized for it, and the upstream pre-initializer emits its `InitializeConfidentialTransferFee`. The devnet e2e suite now covers a fee-bearing confidential transfer under both the older and the newer fee schedule.
