/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@solana/mosaic-sdk'],
    turbopack: {
        // @solana/zk-sdk has no isomorphic entry; the SDK imports the `/node`
        // subpath (Node/Jest). In the browser bundle that build fails (it does
        // `require('fs')` to load its WASM), so redirect it to the `/bundler`
        // build, which loads WASM via bundler-native WASM-ESM (verified under
        // Turbopack). See HOO-628 Phase 0 spike.
        resolveAlias: {
            '@solana/zk-sdk/node': '@solana/zk-sdk/bundler',
        },
    },
};

export default nextConfig;
