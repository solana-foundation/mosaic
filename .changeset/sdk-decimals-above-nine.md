---
'@solana/mosaic-sdk': patch
---

Amount conversion (`decimalAmountToRaw`, and every mint/burn/transfer/force/lock/confidential path that uses it) now supports any Token-2022 decimals from 0 to 255 instead of rejecting anything above 9; an amount over u64 now throws `Amount exceeds the maximum u64 token amount`; mint creation rejects decimals that aren't whole numbers from 0 to 255; pass amounts as strings to keep precision at high decimals.
