---
'@solana/mosaic-sdk': minor
---

Plan confidential operations into transaction v1 (SIMD-0385) messages, opt-in

`createConfidentialTransactionPlanner` and `planConfidentialInstructions` accept a `version` option. It defaults to `0`, so existing callers are unaffected. Passing `version: 1` packs [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md) messages instead, raising the per-transaction budget from 1232 to 4096 bytes and folding proof setup, the token instruction and cleanup into far fewer transactions — fewer signatures, fewer round trips, less context-state rent churn for the same operation.

The version is an option rather than a global switch because it is a wire-compatibility choice that belongs to the caller: version 1 needs Agave ≥ 4.2.2 on the RPC, and wallet and multisig support varies. The `txv1` feature gate is live on mainnet, devnet and testnet.

**Version 1 makes resource limits the caller's responsibility.** Legacy and version-0 transactions fall back to the runtime default of 200k compute units per instruction when no limit is set. Version 1 has no such fallback: `computeUnitLimit` and `loadedAccountsDataSizeLimit` are header fields that default to zero, so a message sent without them is budgeted 0 CUs and 0 loaded-account bytes and fails on chain. The planner fills both with Kit's provisory value (`0`) while packing, so the fields occupy their real wire bytes and the size accounting stays correct.

**New: `estimateAndSetConfidentialResourceLimits`** replaces those provisory values with simulated ones. Call it per transaction, after the lifetime is set and immediately before signing — not once over the whole plan up front: simulation needs a lifetime (planned messages deliberately have none), and a plan's later transactions read proof context-state accounts that its own earlier transactions create, so simulating them before those land fails on a missing account. For version 1 it throws when the RPC omits `loadedAccountsDataSize`, since version 1 cannot be sent without that limit. On version-0 and legacy messages it adds a compute-unit-limit instruction instead, leaving header fields untouched.

`recordBackedProof` is a version-0 workaround and should be left off at version 1: it exists only because a version-0 range-proof transaction sits too close to 1232 bytes to also fit a compute-unit-limit instruction, and at 4096 bytes with a header field it only adds transactions and rent churn. Note also that version 1 inlines all accounts — no address lookup tables — which these flows stay well inside.
