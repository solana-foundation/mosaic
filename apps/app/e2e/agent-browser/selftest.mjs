// Offline self-test for the agent-browser harness: no browser, no app, no
// network, and throwaway keys generated per run. It checks the parts that
// decide whether a run is reported green: the test wallet's bookkeeping, the
// keypair resolution, and run.sh/lib.sh driven through a stub agent-browser.
//
// Run from apps/app: `node e2e/agent-browser/selftest.mjs` (also `pnpm test`).
/* global process */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInThisContext } from 'node:vm';
import {
    address,
    blockhash,
    compileTransaction,
    createTransactionMessage,
    getBase58Decoder,
    getTransactionEncoder,
    pipe,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '../..');
const TMP = mkdtempSync(join(tmpdir(), 'mosaic-e2e-selftest-'));
// Bundles this test builds, one per suite: tests run after every suite has been collected.
const BUNDLE = 'selftest-wallet.js';
const KEYS_BUNDLE = 'selftest-keys.js';

after(() => {
    rmSync(TMP, { recursive: true, force: true });
    for (const name of [BUNDLE, KEYS_BUNDLE]) rmSync(join(APP_ROOT, '.agent-browser', name), { force: true });
});

/** Writes a fresh Solana CLI keypair file (seed followed by public key) and returns its path and address. */
function newKeypair(name) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
    const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const path = join(TMP, `${name}.json`);
    writeFileSync(path, JSON.stringify([...seed, ...pub]));
    return { path, address: getBase58Decoder().decode(pub) };
}

const KEY_A = newKeypair('a');
const KEY_B = newKeypair('b');

/**
 * The environment child processes get: no keypair or RPC variables from the
 * caller, and HOME pointed at the scratch directory, so the default
 * ~/.config/solana keypairs can never be the real ones.
 */
const BASE_ENV = {
    ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('MOSAIC_TEST_KEYPAIR') && k !== 'SOLANA_RPC_URL'),
    ),
    HOME: TMP,
};

/** Runs a node script with BASE_ENV plus `env`; returns { status, stdout, stderr }. */
function runNode(script, args, env = {}) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd: APP_ROOT,
        env: { ...BASE_ENV, ...env },
        encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/** Runs build-test-wallet.mjs; returns the address it says it embedded. */
function buildWallet(args, env = {}, out = BUNDLE) {
    const { status, stdout, stderr } = runNode(join(HERE, 'build-test-wallet.mjs'), [...args, '--out', out], env);
    assert.equal(status, 0, stderr);
    const embedded = / for ([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(stdout);
    assert.ok(embedded, `no address in: ${stdout}`);
    return embedded[1];
}

// ---------------------------------------------------------------------------
// Keypairs: one resolution for the wallet bundle and chain.mjs
// ---------------------------------------------------------------------------

describe('keypairs', () => {
    test('chain.mjs runs through a symlinked path', () => {
        const link = join(TMP, 'linked-harness');
        symlinkSync(HERE, link, 'dir');
        const chain = join(link, 'chain.mjs');
        const address = runNode(chain, ['address', '--role', 'a'], { MOSAIC_TEST_KEYPAIR_A: KEY_A.path });
        assert.equal(address.status, 0, address.stderr);
        assert.equal(address.stdout, KEY_A.address);
        const bogus = runNode(chain, ['no-such-command']);
        assert.equal(bogus.status, 1);
        assert.match(bogus.stderr, /unknown command 'no-such-command'/);
    });

    test('the wallet bundle and chain.mjs use the same key by default', () => {
        const chainAddress = env => {
            const { status, stdout, stderr } = runNode(join(HERE, 'chain.mjs'), ['address', '--role', 'a'], env);
            assert.equal(status, 0, stderr);
            return stdout;
        };
        const legacy = { MOSAIC_TEST_KEYPAIR: KEY_A.path };
        assert.equal(buildWallet([], legacy, KEYS_BUNDLE), KEY_A.address);
        assert.equal(chainAddress(legacy), KEY_A.address);
        const both = { MOSAIC_TEST_KEYPAIR: KEY_A.path, MOSAIC_TEST_KEYPAIR_A: KEY_B.path };
        assert.equal(buildWallet([], both, KEYS_BUNDLE), KEY_B.address);
        assert.equal(chainAddress(both), KEY_B.address);
        assert.equal(buildWallet(['--role', 'b'], { MOSAIC_TEST_KEYPAIR_B: KEY_A.path }, KEYS_BUNDLE), KEY_A.address);
    });

    test('a missing keypair fails the build and names the file', () => {
        const { status, stderr } = runNode(join(HERE, 'build-test-wallet.mjs'), ['--out', KEYS_BUNDLE]);
        assert.equal(status, 1);
        assert.match(stderr, /could not read keypair at .*mosaic-e2e-a\.json/);
    });
});

// ---------------------------------------------------------------------------
// The test wallet
// ---------------------------------------------------------------------------

/**
 * Loads the built bundle into this process the way an init script loads it
 * into a page, and returns the registered wallet and its control surface.
 * Each call evaluates the bundle again, so every wallet starts fresh.
 */
function loadWallet() {
    let wallet;
    globalThis.isSecureContext = true;
    globalThis.window = new EventTarget();
    window.addEventListener('wallet-standard:register-wallet', event => event.detail({ register: w => (wallet = w) }));
    runInThisContext(readFileSync(join(APP_ROOT, '.agent-browser', BUNDLE), 'utf8'), { filename: BUNDLE });
    assert.ok(wallet, 'the bundle registered no wallet');
    return { wallet, control: window.__mosaicTestWallet };
}

/** A compiled, unsigned wire transaction with `feePayer` as its only signer. */
function wireTransaction(feePayer) {
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(address(feePayer), m),
        m =>
            setTransactionMessageLifetimeUsingBlockhash(
                { blockhash: blockhash('1'.repeat(32)), lastValidBlockHeight: 0n },
                m,
            ),
    );
    return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
}

async function connected() {
    const w = loadWallet();
    const { accounts } = await w.wallet.features['standard:connect'].connect();
    return { ...w, account: accounts[0] };
}

const signTransaction = (w, account, chain = 'solana:devnet') =>
    w.wallet.features['solana:signTransaction'].signTransaction({
        account,
        chain,
        transaction: wireTransaction(account.address),
    });
const signMessage = (w, account) =>
    w.wallet.features['solana:signMessage'].signMessage({ account, message: new TextEncoder().encode('hello') });
const entry = (kind, n, outcome, account) => ({ kind, n, outcome, account });

describe('test wallet', () => {
    buildWallet(['--keypair', KEY_A.path, '--alt', KEY_B.path]);

    test("the connector's non-standard probe is not a sign request", async () => {
        const w = await connected();
        await assert.rejects(
            w.wallet.features['solana:signTransaction'].signTransaction({
                account: w.account,
                chain: 'solana:devnet',
                transactions: [wireTransaction(w.account.address)],
            }),
            /expected the Wallet Standard `transaction` input/,
        );
        assert.deepEqual(w.control.counts, { signTransaction: 0, signMessage: 0 });
        assert.deepEqual(w.control.log, []);
        assert.equal(w.control.lastError, null);
    });

    test('a signed transaction is counted and logged once', async () => {
        const w = await connected();
        const [{ signedTransaction }] = await signTransaction(w, w.account);
        assert.ok(signedTransaction instanceof Uint8Array);
        assert.equal(w.control.counts.signTransaction, 1);
        assert.deepEqual(w.control.log, [entry('signTransaction', 1, 'signed', KEY_A.address)]);
        assert.equal(w.control.lastError, null);
    });

    test('a request for another chain is counted and logged as refused', async () => {
        const w = await connected();
        await assert.rejects(signTransaction(w, w.account, 'solana:mainnet'), /only signs for solana:devnet/);
        assert.equal(w.control.counts.signTransaction, 1);
        assert.deepEqual(w.control.log, [entry('signTransaction', 1, 'refused', KEY_A.address)]);
        assert.match(w.control.lastError, /only signs for solana:devnet/);
    });

    test('a request for an account that is not connected is counted and logged as refused', async () => {
        const w = await connected();
        assert.equal(w.control.switchAccount(), KEY_B.address);
        await assert.rejects(signTransaction(w, w.account), /is not connected/);
        await assert.rejects(signMessage(w, w.account), /is not connected/);
        assert.deepEqual(w.control.counts, { signTransaction: 1, signMessage: 1 });
        assert.deepEqual(w.control.log, [
            entry('signTransaction', 1, 'refused', KEY_A.address),
            entry('signMessage', 1, 'refused', KEY_A.address),
        ]);
    });

    test("lastError is the most recent request's error and a later success clears it", async () => {
        const w = await connected();
        w.control.refuseSignMessage();
        await assert.rejects(signMessage(w, w.account), /cannot sign solana transactions/);
        assert.match(w.control.lastError, /cannot sign solana transactions/);
        w.control.refuseSignMessage(null);
        await signMessage(w, w.account);
        assert.equal(w.control.lastError, null);
        assert.deepEqual(
            w.control.log.map(r => r.outcome),
            ['refused', 'signed'],
        );
    });

    test('overlapping requests keep their own number and account', async () => {
        const w = await connected();
        w.control.delaySignMs(50);
        const first = signTransaction(w, w.account);
        const second = signTransaction(w, w.account);
        // The user switches accounts while both signatures are pending.
        w.control.switchAccount();
        await Promise.all([first, second]);
        const log = [...w.control.log].sort((x, y) => x.n - y.n);
        assert.deepEqual(log, [
            entry('signTransaction', 1, 'signed', KEY_A.address),
            entry('signTransaction', 2, 'signed', KEY_A.address),
        ]);
    });

    test('rejectSignTransaction(2) rejects the second request from arming with code 4001', async () => {
        const w = await connected();
        await signTransaction(w, w.account);
        w.control.rejectSignTransaction(2);
        await signTransaction(w, w.account);
        await assert.rejects(signTransaction(w, w.account), error => error.code === 4001);
        assert.match(w.control.lastError, /User rejected/);
        await signTransaction(w, w.account);
        assert.deepEqual(
            w.control.log.map(r => `${r.n}:${r.outcome}`),
            ['1:signed', '2:signed', '3:rejected', '4:signed'],
        );
    });
});
