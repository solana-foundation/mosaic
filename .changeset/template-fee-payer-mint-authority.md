---
'@solana/mosaic-sdk': patch
'@solana/mosaic-cli': patch
---

Fix the single-signer template path. When `mintAuthority` is passed as the fee payer's address (the README example, and the CLI's default when `--mint-authority` is omitted), the templates now reuse the fee payer's signer for the mint authority. They no longer wrap the address in a separate no-op signer. Before, the transaction carried two different signer objects for one address, and Kit's `signTransactionMessageWithSigners` threw `Multiple distinct signers were identified for address …`. The same holds when the mint authority is a different signer object for the fee payer's key, such as a no-op signer next to a wallet's signer. `Token.buildInstructions` also treats a `mintAuthority` with the fee payer's address, as a bare address or another signer object, as the fee payer itself, so the `TokenMetadata` initializer no longer rejects it. A bare-address mint authority that is not the fee payer is still rejected up front under `TokenMetadata`, as before.

`createMintToTransaction` follows the same rule. Minting into a frozen account on a Token ACL mint adds a thaw signed by the mint authority, and that transaction failed the same way when the mint authority was the fee payer's key. The CLI's `mint --raw-tx` also reuses one no-op signer when `--fee-payer` is omitted or names the authority.
