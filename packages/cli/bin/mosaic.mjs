#!/usr/bin/env node
import './register-zk-node.mjs';

// This import MUST stay dynamic: all of a module's static imports resolve
// before its body runs, so a static import of the CLI would resolve
// token-2022 → @solana/zk-sdk/bundler before the hook above is registered.
await import('../dist/index.js');
