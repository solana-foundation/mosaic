---
'@solana/mosaic-sdk': patch
---

Transfers of a mint with an active transfer hook now work: `createTransferInstructions` / `createTransferTransaction`, `createForceTransferTransaction` and the MMF lock-op transfers append the hook's extra accounts (resolved from its `extra-account-metas` validation account), the hook program and the validation account to `TransferChecked`, as Token-2022 requires. Mints with no hook or an inactive hook get the same instruction as before, with no extra RPC call. If the hook's validation account is not initialized, the builders throw instead of producing a transfer Token-2022 would reject. The resolver is exported (`resolveExtraAccountMetasForExecute`, `withTransferHookAccounts`, `getTransferHookProgramId`, the `ExtraAccountMeta` codec and `findExtraAccountMetaListPda`).
