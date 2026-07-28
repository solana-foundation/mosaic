---
'@solana/mosaic-sdk': minor
---

Expose the confidential-balances approve policy and auditor ElGamal pubkey on the token templates, and fix the custom-token `DefaultAccountState` gate.

`Token.withConfidentialBalances` has always accepted a `{ authority, policy, auditorElgamalPubkey }` object, but every template called the bare-`Address` overload, so both values were unreachable through the template API. `createCustomTokenInitTransaction`, `createTokenizedSecurityInitTransaction` and `createMmfInitTransaction` now accept `confidentialBalancesPolicy` and `auditorElgamalPubkey` in their existing options bag; `createStablecoinInitTransaction` accepts them via a new trailing `StablecoinExtraOptions` argument (its parameters are positional for historical reasons, so new options go in a bag rather than becoming a 17th positional). `ConfidentialApprovePolicy` and `ConfidentialBalancesOptions` are now exported from the package root.

All additions are optional and default to today's values (`policy: 'whitelist'`, no auditor), so existing callers produce byte-identical transactions.

Two behavior changes in `createCustomTokenInitTransaction`, both fixes:

- **`enableDefaultAccountState: false` no longer adds the extension.** The gate tested `!== undefined`, so an explicit `false` still added `DefaultAccountState`. Callers that always pass a boolean — `apps/app` does — got the extension on every mint regardless of the caller's intent. It is now a truthiness check. The extension is still added unconditionally on the sRFC-37 path, which requires it.
- **sRFC-37 + `aclMode: 'allowlist'` now defaults to Frozen instead of Initialized.** When `enableDefaultAccountState` was omitted, the fallback hardcoded Initialized and ignored `aclMode`. An allowlist needs frozen-by-default accounts so they are opened through the permissionless-thaw path; a blocklist is allow-by-default and stays Initialized. This matches what `stablecoin`, `tokenized-security` and `arcade-token` already do. An explicit `defaultAccountStateInitialized` still wins.
