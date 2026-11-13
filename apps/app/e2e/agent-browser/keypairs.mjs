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
/* global process */
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
