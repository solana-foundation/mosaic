---
'@solana/mosaic-sdk': patch
---

Fix `createBurnTransaction` dropping the fee payer signer: the message set the fee payer by address only, so when the fee payer was not also the token owner (or the permissioned burn authority) it never signed and the transaction could not be sent.

The same bug is fixed in `createCloseAccountTransaction`, the Token ACL builders `getCreateConfigTransaction`, `getSetGatingProgramTransaction`, `getEnablePermissionlessThawTransaction` and `getThawPermissionlessTransaction`, and the ABL builder `getRemoveWalletTransaction`: none of their instructions carries the fee payer as a signer (`create_config` takes `payer` as a plain writable account), so a fee payer distinct from the authority or owner never signed. Every other transaction builder now attaches its fee payer as a signer too, for consistency.

Kit refuses to sign a transaction that carries two distinct signer objects for one address, so a fee payer attached as a signer must be the same object as any authority on its key. `createBurnTransaction` (fee payer, owner and permissioned burn authority), `createCloseAccountTransaction`, `Token.buildTransaction` and the Token ACL and ABL builders above, plus `getCreateListTransaction`, `getSetExtraMetasTransaction` and `getAddWalletTransaction`, now resolve every role on one key to a single signer, preferring a real signer over a no-op one. A self-burn whose fee payer is given as the owner's address, for example, signs again.
