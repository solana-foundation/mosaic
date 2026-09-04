---
'@solana/mosaic-sdk': patch
'@solana/mosaic-cli': patch
---

Fix the published CLI failing to run under Node ESM: resolve `@solana/zk-sdk`'s wasm import via a bin-level resolve hook, make `bin/mosaic.mjs` the published entrypoint, and fix mint-type detection in `inspectToken` to correctly recognize tokenized-security and MMF tokens instead of misclassifying them as stablecoin/arcade-token.
