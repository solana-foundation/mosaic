---
'@solana/mosaic-sdk': minor
---

Let the templates create a mint with an encrypted supply

`createCustomTokenInitTransaction`, `createStablecoinInitTransaction` and `createTokenizedSecurityInitTransaction` now accept the `ConfidentialMintBurn` init values, so a mint with an encrypted supply can be created without dropping to the low-level `Token` builder — which is what a caller building on the templates would have had to do, losing the sRFC-37, ABL and metadata setup the templates own.

Custom token takes `enableConfidentialMintBurn` + `confidentialMintBurn` (matching its `enableConfidentialBalances` + `confidentialBalances` pair); the other two take `confidentialMintBurn` alone, since they always carry confidential balances. Both values come from the supply authority's wallet keys via `getConfidentialMintBurnInit`, and the extension is added after `ConfidentialTransferMint` so the builder's both-extensions-required ordering holds.

Also exports the extension readers the builders use — `isConfidentialMintBurn`, `isConfidentialTransferMint`, `isConfidentialTransferAccount`, `getConfidentialTransferAccountElgamalPubkey`, `getConfidentialMintBurnSupplyElgamalPubkey`, `mintHasConfidentialTransferFee` — from `@solana/mosaic-sdk/confidential`. A caller that wants to check a mint or account before asking a wallet for keys, or verify a supply wallet still matches the mint it was recorded against, needed the same readers the builders already use internally.
