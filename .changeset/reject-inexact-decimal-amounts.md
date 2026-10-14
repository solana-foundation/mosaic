---
'@solana/mosaic-sdk': minor
'@solana/mosaic-cli': patch
---

`decimalAmountToRaw` now throws instead of silently building a different amount. An amount with more fractional digits than the mint's decimals throws `Amount cannot have more than N decimal places` (it was truncated before), and malformed strings such as `''`, `'.'` and `'1.5.5'` throw `Invalid amount format` (they returned `0n` or dropped the trailing part before). This affects every caller of the exported function, including `transfer`, `permissioned-burn` and `mmf/lock-ops`.

`createMintToTransaction`, `createBurnTransaction`, `createForceBurnTransaction` and `createForceTransferTransaction` accept the amount as `number | string`. The CLI `mint`, `burn`, `force-burn` and `force-transfer` commands now forward the amount string unchanged instead of passing it through `parseFloat`, so amounts above 2^53 reach the chain exactly as typed.

CLI `force-transfer` now passes the authority and fee payer as signers rather than bare addresses, so the built transaction carries its signers.
