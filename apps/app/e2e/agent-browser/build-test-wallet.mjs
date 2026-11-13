// Bundles test-wallet.ts into a single IIFE for `agent-browser --init-script`,
// with a devnet test keypair embedded.
//
// Usage: node e2e/agent-browser/build-test-wallet.mjs [options]
//   --role a|b           sign with that role's keypair (default a), resolved by
//                        keypairs.mjs exactly as chain.mjs resolves it
//   --keypair <path>     sign with this Solana CLI keypair JSON instead
//   --alt-role b         second keypair, reachable with window.__mosaicTestWallet.switchAccount()
//   --alt <path>         the same, from a file
//   --no-sign-message    leave out solana:signMessage, like a wallet that cannot sign messages
//   --out <name>         output file name (default: test-wallet.js)
//
// Prints the address it embedded. Output: apps/app/.agent-browser/<name>,
// which is gitignored because it contains secret keys. Never commit it or
// paste it anywhere.
/* global process, console */
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getBase58Decoder } from '@solana/kit';
import { keypairPath } from './keypairs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');

function die(message) {
    console.error(`build-test-wallet: ${message}`);
    process.exit(1);
}

const { values: args } = parseArgs({
    options: {
        role: { type: 'string', default: 'a' },
        keypair: { type: 'string' },
        'alt-role': { type: 'string' },
        alt: { type: 'string' },
        'no-sign-message': { type: 'boolean', default: false },
        out: { type: 'string', default: 'test-wallet.js' },
    },
});

function pathFor(path, role) {
    if (path) return path;
    try {
        return keypairPath(role);
    } catch (error) {
        die(error.message);
    }
}

function readKeypair(path) {
    let secretKey;
    try {
        secretKey = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        die(`could not read keypair at ${path}: ${error.message}`);
    }
    if (!Array.isArray(secretKey) || secretKey.length !== 64) {
        die(`${path} is not a 64-byte Solana CLI keypair`);
    }
    return secretKey;
}

const secretKey = readKeypair(pathFor(args.keypair, args.role));
const altPath = args.alt ?? (args['alt-role'] ? pathFor(undefined, args['alt-role']) : null);
const altSecretKey = altPath ? readKeypair(altPath) : null;
// A Solana CLI keypair file is the 32-byte seed followed by the 32-byte public key.
const walletAddress = getBase58Decoder().decode(new Uint8Array(secretKey.slice(32)));
const outfile = join(appRoot, '.agent-browser', basename(args.out));

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
    },
    legalComments: 'none',
    logLevel: 'warning',
});

const modes = [altSecretKey && 'alt account', args['no-sign-message'] && 'no signMessage'].filter(Boolean);
console.log(`build-test-wallet: wrote ${outfile} for ${walletAddress}${modes.length ? ` (${modes.join(', ')})` : ''}`);
