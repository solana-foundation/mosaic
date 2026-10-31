---
'@solana/mosaic-sdk': minor
'@solana/mosaic-cli': patch
---

`decimalAmountToRaw` now throws instead of silently building a different amount. An amount with more fractional digits than the mint's decimals throws `Amount cannot have more than N decimal places` (it was truncated before), and malformed strings such as `''`, `'.'` and `'1.5.5'` throw `Invalid amount format` (they returned `0n` or dropped the trailing part before). This affects every caller of the exported function, including `transfer`, `permissioned-burn` and `mmf/lock-ops`.

`createMintToTransaction`, `createBurnTransaction`, `createForceBurnTransaction` and `createForceTransferTransaction` accept the amount as `number | string`. The CLI `mint`, `burn`, `force-burn` and `force-transfer` commands now forward the amount string unchanged instead of passing it through `parseFloat`, so amounts above 2^53 reach the chain exactly as typed. These commands now accept only plain decimal digits: exponent (`1e3`) and signed (`+1`) spellings are rejected.

`decimalAmountToRaw` now rejects a zero amount such as `'0'`, `'0.000'` or `0` with `Amount must be a positive number`. It used to return `0n`, which built an instruction that pays fees and moves nothing. Code that uses the exported function to convert a zero balance needs to handle zero before calling it.

A `number` amount is now stringified without exponent notation and without rounding, so small values such as `1e-7` on a high-decimal mint are scaled correctly instead of being rejected as malformed, and `1e-21` on a 9-decimal mint throws instead of becoming `0n`.

CLI `force-transfer` now passes the authority and fee payer as signers rather than bare addresses, so the built transaction carries its signers.
