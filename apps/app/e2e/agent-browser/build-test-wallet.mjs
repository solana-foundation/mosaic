// Bundles test-wallet.ts into a single IIFE for `agent-browser --init-script`,
// with a devnet test keypair embedded.
//
// Usage: node e2e/agent-browser/build-test-wallet.mjs [options]
//   --keypair <path>     Solana CLI keypair JSON the wallet signs with
//                        (default: $MOSAIC_TEST_KEYPAIR, else ~/.config/solana/devnet-test.json)
//   --alt <path>         second keypair, reachable with window.__mosaicTestWallet.switchAccount()
//   --no-sign-message    leave out solana:signMessage, like a wallet that cannot sign messages
//   --tx-v1              advertise version-1 transactions, so the app plans SIMD-0385 messages
//   --out <name>         output file name (default: test-wallet.js)
//
// Output: apps/app/.agent-browser/<name>, which is gitignored because it
// contains secret keys. Never commit it or paste it anywhere.
/* global process, console */
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');

const { values: args } = parseArgs({
    options: {
        keypair: { type: 'string' },
        alt: { type: 'string' },
        'no-sign-message': { type: 'boolean', default: false },
        'tx-v1': { type: 'boolean', default: false },
        out: { type: 'string', default: 'test-wallet.js' },
    },
});

const keypairPath =
    args.keypair ?? process.env.MOSAIC_TEST_KEYPAIR ?? join(homedir(), '.config/solana/devnet-test.json');
const outfile = join(appRoot, '.agent-browser', basename(args.out));

function readKeypair(path) {
    let secretKey;
    try {
        secretKey = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        console.error(`build-test-wallet: could not read keypair at ${path}: ${error.message}`);
        process.exit(1);
    }
    if (!Array.isArray(secretKey) || secretKey.length !== 64) {
        console.error(`build-test-wallet: ${path} is not a 64-byte Solana CLI keypair`);
        process.exit(1);
    }
    return secretKey;
}

const secretKey = readKeypair(keypairPath);
const altSecretKey = args.alt ? readKeypair(args.alt) : null;
const txVersions = args['tx-v1'] ? ['legacy', 0, 1] : ['legacy', 0];

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
    define: {
        __MOSAIC_TEST_SECRET_KEY__: JSON.stringify(secretKey),
        __MOSAIC_TEST_ALT_SECRET_KEY__: JSON.stringify(altSecretKey),
        __MOSAIC_TEST_SIGN_MESSAGE__: JSON.stringify(!args['no-sign-message']),
        __MOSAIC_TEST_TX_VERSIONS__: JSON.stringify(txVersions),
    },
    legalComments: 'none',
    logLevel: 'warning',
});

const modes = [
    altSecretKey && 'alt account',
    args['no-sign-message'] && 'no signMessage',
    args['tx-v1'] && 'tx v1',
].filter(Boolean);
console.log(`build-test-wallet: wrote ${outfile}${modes.length ? ` (${modes.join(', ')})` : ''}`);
