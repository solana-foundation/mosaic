import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants.js';

/** The app's custom RPC endpoint; see providers.tsx. */
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

/** Genesis hashes of the public clusters, keyed by NEXT_PUBLIC_SOLANA_NETWORK value. */
const GENESIS_HASHES = {
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
    'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
};

/** Mirrors getConfiguredNetwork() in src/lib/solana/network.ts. */
function configuredNetwork() {
    const value = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
    if (value === 'mainnet' || value === 'mainnet-beta') return 'mainnet-beta';
    if (value === 'testnet') return 'testnet';
    return 'devnet';
}

/** Hides query strings, where providers put API keys. */
function redact(url) {
    try {
        const parsed = new URL(url);
        return parsed.search ? `${parsed.origin}${parsed.pathname}?…` : url;
    } catch {
        return '<invalid URL>';
    }
}

/**
 * The app attaches the env RPC to the configured network's cluster, so a URL
 * that serves another public cluster would put e.g. mainnet behind the Devnet
 * label. Refuse that. An unknown genesis hash (a local validator, surfpool) is
 * allowed, and an unreachable endpoint only warns so offline builds still work.
 */
async function assertRpcServesNetwork(url, network) {
    let genesisHash;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }),
            signal: AbortSignal.timeout(10_000),
        });
        genesisHash = (await response.json()).result;
    } catch (error) {
        console.warn(`Could not check which cluster ${redact(url)} serves: ${error.message}`);
        return;
    }
    const served = Object.keys(GENESIS_HASHES).find(name => GENESIS_HASHES[name] === genesisHash);
    if (served && served !== network) {
        throw new Error(
            `The RPC URL ${redact(url)} serves ${served}, but the app's network is ${network}. ` +
                `Set NEXT_PUBLIC_SOLANA_NETWORK=${served} or point the RPC URL at ${network}.`,
        );
    }
}

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
    //
    // Dev runs on webpack too (`next dev --webpack`). Everything this config
    // does lives in the `webpack` hook below, and Turbopack runs none of it:
    // the SDK's `.js` -> `.ts` `resolve.extensionAlias` in particular has no
    // Turbopack equivalent (`experimental.extensionAlias` is on Next's
    // Turbopack-unsupported list), so `next dev --turbopack` fails to resolve
    // the SDK source at all. Keeping both compilations on the same bundler
    // also stops dev and prod from drifting apart the way they did in HOO-628.
    webpack: (config, { isServer }) => {
        // The SDK is consumed from source (transpilePackages + the tsconfig
        // paths alias) but its relative imports carry explicit `.js`
        // extensions for Node ESM; map them back onto the `.ts` sources.
        config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            '.js': ['.ts', '.tsx', '.js'],
        };
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

export default async function config(phase) {
    if (rpcUrl && (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER)) {
        await assertRpcServesNetwork(rpcUrl, configuredNetwork());
    }
    return nextConfig;
}
