---
'@solana/mosaic-sdk': patch
---

Reject mint extension combinations that Token-2022 refuses at `InitializeMint`. `Token.buildInstructions`, and the templates built on it, now throw a named error before any RPC for a transfer fee plus confidential balances without the confidential transfer fee extension, and for scaled UI amount plus interest bearing. Both used to build and sign, then fail on-chain with `InvalidExtensionCombination`.
