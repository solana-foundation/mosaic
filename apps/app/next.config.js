/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@solana/mosaic-sdk'],
    // `@solana-program/token-2022` (pulled in via `@solana/mosaic-sdk`) does a
    // top-level `import { ... } from '@solana/zk-sdk/bundler'`, dragging a
    // 2.6 MB `.wasm` confidential-transfer crypto module into BOTH the client
    // and server bundles. Under Turbopack production this broke at runtime on
    // Vercel: the client fetched the wasm chunk as `text/plain`, and
    // `WebAssembly.instantiateStreaming` (no MIME fallback) threw. We therefore
    // build production with webpack (`next build --webpack`) and split the two
    // compilations — see below. See HOO-628.
    webpack: (config, { isServer }) => {
        if (isServer) {
            // The browser `bundler` wasm build cannot be emitted/resolved in
            // Next's server bundle (webpack emits it inside `.next/server` but
            // the prerender runtime can't locate it → ENOENT). Route the server
            // to zk-sdk's Node build, which loads `index_bg.wasm` from
            // node_modules via `fs.readFileSync(join(__dirname, ...))` at
            // runtime, and keep it EXTERNAL so `__dirname` stays in node_modules
            // instead of being rewritten to a bundled chunk path.
            const externalizeZkSdkToNode = ({ request }, callback) => {
                if (request === '@solana/zk-sdk/bundler' || request === '@solana/zk-sdk') {
                    return callback(null, 'commonjs @solana/zk-sdk/node');
                }
                return callback();
            };
            const previous = config.externals;
            config.externals = [
                externalizeZkSdkToNode,
                ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
            ];
        } else {
            // Client: enable async wasm bundling and emit the wasm as a hashed
            // `.wasm` asset under `_next/static/wasm/` so Vercel's CDN serves it
            // with the correct `application/wasm` MIME type. Only the client
            // actually bundles the wasm — the server externalizes it above.
            config.experiments = {
                ...config.experiments,
                asyncWebAssembly: true,
            };
            config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
        }

        return config;
    },
};

export default nextConfig;
