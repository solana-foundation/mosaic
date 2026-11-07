---
'@solana/mosaic-sdk': minor
'@solana/mosaic-cli': patch
---

`decimalAmountToRaw` now throws instead of silently building a different amount. A string amount with more fractional digits than the mint's decimals throws `Amount cannot have more than N decimal places` (it was truncated before), and malformed strings such as `''`, `'.'` and `'1.5.5'` throw `Invalid amount format` (they returned `0n` or dropped the trailing part before). This affects every caller of the exported function, including `transfer`, `permissioned-burn` and `mmf/lock-ops`.

`createMintToTransaction`, `createBurnTransaction`, `createForceBurnTransaction`, `createForceTransferTransaction` and `createPermissionedBurnTransaction`, and the `decimalAmount` of the `mmf` lock ops, accept the amount as `number | string`. The CLI `mint`, `burn`, `force-burn` and `force-transfer` commands now forward the amount string unchanged instead of passing it through `parseFloat`, so amounts above 2^53 reach the chain exactly as typed. These commands now accept only plain decimal digits: exponent (`1e3`) and signed (`+1`) spellings are rejected.

`decimalAmountToRaw` now rejects a zero amount such as `'0'`, `'0.000'` or `0` with `Amount must be a positive number`. It used to return `0n`, which built an instruction that pays fees and moves nothing. Code that uses the exported function to convert a zero balance needs to handle zero before calling it. A negative amount now throws the same message; it was `Amount must be positive`.

A `number` amount is now stringified without exponent notation, so small values such as `1e-7` on a high-decimal mint are scaled correctly instead of being rejected as malformed. It is then rounded half-up to the mint's decimals rather than truncated: a computed value such as `0.1 + 0.2` (`0.30000000000000004`) gives `300000n` at 6 decimals, and `0.7 - 0.4` (`0.29999999999999993`) now gives `300000n` instead of `299999n`. A number that rounds to zero, such as `1e-21` on a 9-decimal mint, throws instead of becoming `0n`. Only string amounts must fit the mint's decimals exactly.

CLI `force-transfer` now passes the authority and fee payer as signers rather than bare addresses, so the built transaction carries its signers.

New export `validateDecimalAmount(amount: string)` checks a user-supplied amount string with the same checks as `decimalAmountToRaw`, in the same order, so it throws `Amount must be a positive number` for a negative or zero amount and `Invalid amount format` for anything else that isn't a plain decimal. The CLI uses it to validate amounts before building a transaction.

`createMintToTransaction` now passes the mint authority to the mint instruction as a signer, so an `Address` authority is marked as a signer like the other builders. When that address is the fee payer's, the fee payer's signer is reused, so the transaction still signs.
