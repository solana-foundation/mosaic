---
'@solana/mosaic-sdk': patch
---

Add `createUpdateScaledUiMultiplierTransaction` (updates a mint's Scaled UI Amount multiplier, now or at a scheduled time, signed by the scaled UI authority) and `createUpdateMetadataTransaction` (updates a mint's embedded TokenMetadata name, symbol and/or URI, signed by the metadata update authority). The metadata builder checks the update authority before building, and when the metadata grows past the mint's spare lamports it prepends a transfer of the missing rent from the fee payer. `createReallocateInstruction` is now deprecated: `Reallocate` only works on token accounts and fails on a mint, and metadata updates don't need it.
