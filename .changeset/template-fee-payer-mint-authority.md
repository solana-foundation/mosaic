---
'@solana/mosaic-sdk': patch
---

Fix the single-signer template path. When `mintAuthority` is passed as the fee payer's address (the README example, and the CLI's default when `--mint-authority` is omitted), the templates now reuse the fee payer's signer for the mint authority. They no longer wrap the address in a separate no-op signer. Before, the transaction carried two different signer objects for one address, and Kit's `signTransactionMessageWithSigners` threw `Multiple distinct signers were identified for address …`. `Token.buildInstructions` also treats a `mintAuthority` address equal to `feePayer.address` as the fee payer itself, so the `TokenMetadata` initializer no longer rejects it.
