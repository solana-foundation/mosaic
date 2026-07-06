/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@solana/mosaic-sdk'],
    // No `@solana/zk-sdk` bundler alias is needed: the SDK resolves the WASM
    // crypto build via its own `exports` conditions on `@solana/mosaic-sdk/_zk`
    // (`browser` -> `/bundler`, `node` -> `/node`), so confidential imports
    // bundle correctly here with no per-app config. See HOO-628 Phase 0 spike.
};

export default nextConfig;
