---
'@solana/mosaic-sdk': patch
'@solana/mosaic-cli': patch
---

Fix the published CLI failing to run under Node ESM: make `bin/mosaic.mjs` the published entrypoint, and fix mint-type detection in `inspectToken` to correctly recognize tokenized-security and MMF tokens instead of misclassifying them as stablecoin/arcade-token.

The original fix also shipped a bin-level Node resolve hook to redirect `@solana/zk-sdk`'s wasm import. That hook is **removed again in this same release** — `@solana/zk-sdk@0.5.2` carries the `node` condition upstream, so plain Node resolves it without help. See the Kit v8 entry for details.
