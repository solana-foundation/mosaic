// Where the harness finds its devnet keypairs. run.sh (through chain.mjs),
// chain.mjs and build-test-wallet.mjs all resolve a role here, so a wallet
// bundle and the chain checks for the same role always use the same key.
//
//   a       $MOSAIC_TEST_KEYPAIR_A, else $MOSAIC_TEST_KEYPAIR, else ~/.config/solana/mosaic-e2e-a.json
//   b       $MOSAIC_TEST_KEYPAIR_B, else ~/.config/solana/mosaic-e2e-b.json
//   master  $MOSAIC_TEST_KEYPAIR_MASTER, else ~/.config/solana/mosaic-e2e-master.json
//           (optional: a faucet-funded wallet run.sh refills A from)
//
// Devnet and localnet keys only: the test wallet signs with them without asking.
/* global process, Buffer */
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The keypair file for a role. Throws for a role other than a, b or master. */
export function keypairPath(role) {
    const env = process.env;
    const fallback = join(homedir(), `.config/solana/mosaic-e2e-${role}.json`);
    switch (role) {
        case 'a':
            return env.MOSAIC_TEST_KEYPAIR_A || env.MOSAIC_TEST_KEYPAIR || fallback;
        case 'b':
            return env.MOSAIC_TEST_KEYPAIR_B || fallback;
        case 'master':
            return env.MOSAIC_TEST_KEYPAIR_MASTER || fallback;
        default:
            throw new Error(`unknown keypair role '${role}' (expected a, b or master)`);
    }
}

// PKCS#8 DER header for a raw 32-byte Ed25519 seed.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Reads a Solana CLI keypair file (the 32-byte seed followed by the 32-byte
 * public key) and returns its 64 bytes as numbers. Throws unless the file holds
 * 64 bytes and the public half is the one the seed derives: the wallet bundle
 * takes its address from that half, so a mismatch would connect as one address
 * and sign as another.
 */
export function readKeypairFile(path) {
    let bytes;
    try {
        bytes = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        throw new Error(`could not read keypair at ${path}: ${error.message}`);
    }
    if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) {
        throw new Error(`${path} is not a 64-byte Solana CLI keypair`);
    }
    const seed = Buffer.from(bytes.slice(0, 32));
    const derived = createPublicKey(
        createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' }),
    )
        .export({ format: 'der', type: 'spki' })
        .subarray(-32);
    if (!derived.equals(Buffer.from(bytes.slice(32)))) {
        throw new Error(`${path}: the public key does not match the secret key`);
    }
    return bytes;
}
