---
'@solana/mosaic-sdk': patch
---

`isAblAllowlist` and `isAblBlocklist` read only the list config to check the list's mode, instead of also scanning every member wallet.
