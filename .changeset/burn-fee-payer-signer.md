---
'@solana/mosaic-sdk': patch
---

Fix `createBurnTransaction` dropping the fee payer signer: the message set the fee payer by address only, so when the fee payer was not also the token owner (or the permissioned burn authority) it never signed and the transaction could not be sent.

The same bug is fixed in `createCloseAccountTransaction`, the Token ACL builders `getCreateConfigTransaction`, `getSetGatingProgramTransaction`, `getEnablePermissionlessThawTransaction` and `getThawPermissionlessTransaction`, and the ABL builder `getRemoveWalletTransaction`: none of their instructions carries the fee payer as a signer (`create_config` takes `payer` as a plain writable account), so a fee payer distinct from the authority or owner never signed. Every other transaction builder now attaches its fee payer as a signer too, for consistency; those already signed through an instruction account, so their behavior is unchanged.
