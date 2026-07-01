/**
 * Browser / bundler resolution of the `@solana/zk-sdk` WASM crypto dependency.
 *
 * Selected via the `browser` condition in the SDK's `package.json` `exports`
 * for `@solana/mosaic-sdk/_zk`. The `/bundler` build loads its WASM through
 * bundler-native WASM-ESM (verified under Turbopack), unlike `/node` which does
 * `require('fs')` and fails in the browser. See `_zk.node.ts`.
 */
export * from '@solana/zk-sdk/bundler';
