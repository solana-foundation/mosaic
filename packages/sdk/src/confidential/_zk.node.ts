/**
 * Node / Jest resolution of the `@solana/zk-sdk` WASM crypto dependency.
 *
 * `@solana/zk-sdk` ships no isomorphic entry — only `/node` (loads WASM via
 * `require('fs')`), `/web` (fetch), and `/bundler` (bundler-native WASM-ESM).
 * The confidential modules import this internal `@solana/mosaic-sdk/_zk`
 * specifier instead of a fixed subpath; the SDK's `package.json` `exports`
 * conditions then pick this file under the `node` condition and the `/bundler`
 * build (see `_zk.browser.ts`) under the `browser` condition, so consumers get
 * a working build in either environment with no per-app bundler alias.
 */
export * from '@solana/zk-sdk/node';
