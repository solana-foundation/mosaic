---
'@solana/mosaic-sdk': patch
---

Parse transaction v1 (SIMD-0385) messages in the inspection API

`parseConfirmedTransaction` crashed on a version-1 transaction with `Cannot read properties of undefined (reading 'map')`, because a v1 compiled message carries its instructions in `instructionHeaders` and `instructionPayloads` rather than an `instructions` array. Since the inspection API is handed other people's transactions, this failed on live traffic regardless of what Mosaic itself sends. It now reads v1 instructions, and `parseTokenTransaction` and `parseTokenTransactionWithLookups` are covered for v1 by tests.

Fetch transactions with `maxSupportedTransactionVersion: 1` so the RPC returns v1 transactions at all; the docs and examples now say so. v1's resource-budget header fields (`configMask`/`configValues`) are not surfaced on the parsed result yet.
