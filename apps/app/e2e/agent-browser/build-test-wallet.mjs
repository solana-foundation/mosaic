// Bundles test-wallet.ts into a single IIFE for `agent-browser --init-script`,
// with the devnet test keypair embedded.
//
// Usage: node e2e/agent-browser/build-test-wallet.mjs
//   MOSAIC_TEST_KEYPAIR  path to a Solana CLI keypair JSON
//                        (default: ~/.config/solana/devnet-test.json)
//
// Output: apps/app/.agent-browser/test-wallet.js, which is gitignored because it
// contains the secret key. Never commit it or paste it anywhere.
/* global process, console */
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');
const outfile = join(appRoot, '.agent-browser', 'test-wallet.js');

const keypairPath = process.env.MOSAIC_TEST_KEYPAIR ?? join(homedir(), '.config/solana/devnet-test.json');

let secretKey;
try {
    secretKey = JSON.parse(readFileSync(keypairPath, 'utf8'));
} catch (error) {
    console.error(`build-test-wallet: could not read keypair at ${keypairPath}: ${error.message}`);
    process.exit(1);
}
if (!Array.isArray(secretKey) || secretKey.length !== 64) {
    console.error(`build-test-wallet: ${keypairPath} is not a 64-byte Solana CLI keypair`);
    process.exit(1);
}

mkdirSync(dirname(outfile), { recursive: true });

await build({
    entryPoints: [join(here, 'test-wallet.ts')],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    // Pick the browser builds of @solana/kit so signing uses WebCrypto Ed25519.
    conditions: ['browser'],
    define: { __MOSAIC_TEST_SECRET_KEY__: JSON.stringify(secretKey) },
    legalComments: 'none',
    logLevel: 'warning',
});

console.log(`build-test-wallet: wrote ${outfile}`);
