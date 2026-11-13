---
'@solana/mosaic-sdk': patch
---

Fix `createBurnTransaction` dropping the fee payer signer: the message set the fee payer by address only, so when the fee payer was not also the token owner (or the permissioned burn authority) it never signed and the transaction could not be sent.
