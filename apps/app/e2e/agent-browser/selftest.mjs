// Offline self-test for the agent-browser harness: no browser, no app, no
// network, and throwaway keys generated per run. It checks the parts that
// decide whether a run is reported green: the test wallet's bookkeeping, the
// keypair resolution, and run.sh/lib.sh driven through a stub agent-browser.
//
// Run from apps/app: `node e2e/agent-browser/selftest.mjs` (also `pnpm test`).
/* global process */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
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

// ---------------------------------------------------------------------------
// run.sh and lib.sh, against a stub agent-browser and a local app/RPC server
// ---------------------------------------------------------------------------

// A copy of the harness at the same depth (so ../.. and module resolution
// still work), where fixture flows can be added without touching the real one.
const SANDBOX_ROOT = join(APP_ROOT, '.agent-browser', 'selftest');
const SANDBOX = join(SANDBOX_ROOT, 'e2e', 'agent-browser');
const BIN = join(TMP, 'bin');
const HAS_SHELL_TOOLS = ['bash', 'jq', 'curl', 'awk'].every(tool => spawnSync(tool, ['--version']).status === 0);

// Logs every call, fails the ones whose arguments match $STUB_FAIL, and answers
// `eval` from $STUB_EVAL: lines of "<regex><TAB><answer>", first match wins,
// `null` otherwise.
const STUB_AGENT_BROWSER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$STUB_LOG"
if [[ -n "\${STUB_FAIL:-}" && "$*" =~ $STUB_FAIL ]]; then
    echo "stub: failing '$*'" >&2
    exit 1
fi
if [[ "$3" == eval ]]; then
    if [[ -n "\${STUB_EVAL:-}" ]]; then
        while IFS=$'\\t' read -r pattern answer; do
            if [[ -n "$pattern" && "$4" =~ $pattern ]]; then
                printf '%s\\n' "$answer"
                exit 0
            fi
        done <"$STUB_EVAL"
    fi
    echo null
fi
exit 0
`;

/** Fixture flows, by name: the header line and the body after sourcing lib.sh. */
const FIXTURE_FLOWS = {
    noop: ['# e2e:', 'check "the stub answers" ab get title'],
    spend: ['# e2e: funded', 'check "the stub answers" ab get title'],
    'two-sessions': ['# e2e: sessions=b,nosign', 'check "the stub answers" ab get title'],
    // A soft failure, and no finish_flow at the end.
    soft: ['# e2e:', 'soft_check "a soft check" false', 'check "a later check" true'],
    // A command that fails outside any check.
    boom: ['# e2e:', 'false', 'check "never reached" true'],
    blocked: ['# e2e:', 'block_run "the fixture is missing"'],
    'connect-check': ['# e2e:', 'ensure_connected', 'check "ensure_connected returned" true'],
};

function writeFlow(name, [header, ...body]) {
    const script = ['#!/usr/bin/env bash', header, `FLOW=${name}`, 'source "$(dirname "$0")/../lib.sh"', ...body, ''];
    writeFileSync(join(SANDBOX, 'flows', `${name}.sh`), script.join('\n'));
}

/** What the local server answers: the app's page, and getBalance in lamports. */
const server = { page: '<html><body>Mosaic</body></html>', lamports: 1_000_000_000, url: '' };
const httpServer = createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(server.page);
        return;
    }
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
        const { id, method } = JSON.parse(body);
        const result = method === 'getBalance' ? { context: { slot: 1 }, value: server.lamports } : null;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
});

let runCount = 0;
/**
 * Runs the sandbox's run.sh with the stub and returns its exit status, output,
 * and the stub's call log. Every run gets wallets A and B unless `env` says
 * otherwise; pass a missing path to take a wallet away.
 */
function runHarness(args, env = {}, stubEval = []) {
    runCount += 1;
    const log = join(TMP, `stub-${runCount}.log`);
    const evalFile = join(TMP, `stub-eval-${runCount}.tsv`);
    writeFileSync(log, '');
    writeFileSync(evalFile, stubEval.map(([pattern, answer]) => `${pattern}\t${answer}\n`).join(''));
    const child = spawn('bash', [join(SANDBOX, 'run.sh'), ...args], {
        cwd: APP_ROOT,
        env: {
            ...BASE_ENV,
            PATH: `${BIN}:${process.env.PATH}`,
            BASE_URL: server.url,
            SOLANA_RPC_URL: server.url,
            AB_SESSION: 'st',
            MOSAIC_TEST_KEYPAIR_A: KEY_A.path,
            MOSAIC_TEST_KEYPAIR_B: KEY_B.path,
            STUB_LOG: log,
            STUB_EVAL: evalFile,
            ...env,
        },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    return new Promise(resolvePromise =>
        child.on('close', status =>
            resolvePromise({ status, stdout, stderr, calls: readFileSync(log, 'utf8').split('\n').filter(Boolean) }),
        ),
    );
}

/** The results.tsv of the most recent run in the sandbox. */
function lastResults() {
    const runs = join(SANDBOX_ROOT, '.agent-browser', 'runs');
    const latest = readdirSync(runs).sort().pop();
    const file = join(runs, latest, 'results.tsv');
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe('run.sh', { skip: !HAS_SHELL_TOOLS && 'needs bash, jq, curl and awk' }, () => {
    before(async () => {
        rmSync(SANDBOX_ROOT, { recursive: true, force: true });
        cpSync(HERE, SANDBOX, { recursive: true });
        for (const [name, flow] of Object.entries(FIXTURE_FLOWS)) writeFlow(name, flow);
        mkdirSync(BIN, { recursive: true });
        writeFileSync(join(BIN, 'agent-browser'), STUB_AGENT_BROWSER, { mode: 0o755 });
        // The node that runs this test, whatever version manager put it on PATH.
        symlinkSync(process.execPath, join(BIN, 'node'));
        await new Promise(ready => httpServer.listen(0, '127.0.0.1', ready));
        server.url = `http://127.0.0.1:${httpServer.address().port}`;
    });
    after(() => {
        httpServer.close();
        rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    });

    test('an unfunded run needs neither wallet B nor devnet', async () => {
        const run = await runHarness(['noop'], {
            MOSAIC_TEST_KEYPAIR_B: join(TMP, 'missing.json'),
            SOLANA_RPC_URL: 'http://127.0.0.1:9',
        });
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.match(run.stdout, /no wallet B keypair/);
        assert.match(run.stdout, /all flows passed/);
    });

    test('a failed launch closes the sessions already started', async () => {
        const run = await runHarness(['two-sessions'], { STUB_FAIL: '^--session st-b .*open about:blank' });
        assert.notEqual(run.status, 0);
        assert.ok(run.calls.includes('--session st close'), run.calls.join('\n'));
        assert.ok(run.calls.includes('--session st-b close'), run.calls.join('\n'));
        assert.deepEqual(
            run.calls.filter(call => call.startsWith('--session st-nosign ')),
            [],
            'a session that never launched was touched (agent-browser would start a browser for it)',
        );
    });

    test('a funded run stops when wallet A is below the minimum, and runs at 1 SOL', async () => {
        server.lamports = 100_000_000;
        const poor = await runHarness(['spend']);
        assert.equal(poor.status, 1, poor.stdout + poor.stderr);
        assert.match(poor.stderr, /need at least 0\.3 devnet SOL/);
        server.lamports = 1_000_000_000;
        const funded = await runHarness(['spend']);
        assert.equal(funded.status, 0, funded.stdout + funded.stderr);
    });

    test('a funded run fails when the balance cannot be read', async () => {
        const run = await runHarness(['spend'], { SOLANA_RPC_URL: 'http://127.0.0.1:9' });
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.match(run.stderr, /could not read wallet a's balance/);
        assert.doesNotMatch(run.stdout, /all flows passed/);
    });

    test('a failed soft_check fails the run without finish_flow', async () => {
        const run = await runHarness(['soft']);
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.doesNotMatch(run.stdout, /all flows passed/);
        assert.match(lastResults(), /^fail\tsoft\ta soft check$/m);
    });

    test('a command that fails outside a check is recorded', async () => {
        const run = await runHarness(['boom']);
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.match(lastResults(), /^fail\tboom\tstopped at: false$/m);
        assert.match(run.stdout, /results, /, 'the summary was not printed');
        assert.doesNotMatch(lastResults(), /never reached/);
    });

    test('a blocked run exits 3 and skips the remaining flows', async () => {
        const run = await runHarness(['blocked', 'noop']);
        assert.equal(run.status, 3, run.stdout + run.stderr);
        assert.match(run.stdout, /run blocked during blocked/);
        assert.doesNotMatch(lastResults(), /the stub answers/);
    });

    // Stub answers for lib.sh's wallet probes.
    const WALLET_PRESENT = ['!!window\\.__mosaicTestWallet\\)', 'true'];
    const CONNECT_BUTTON_SHOWN = ['=== "Connect Wallet"', 'true'];

    test('ensure_connected fails on a page with neither the wallet nor a Connect Wallet button', async () => {
        const run = await runHarness(['connect-check'], { STUB_FAIL: 'wait --fn' }, [WALLET_PRESENT]);
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.match(lastResults(), /^fail\tconnect-check\tthe page shows neither the connected wallet/m);
    });

    test('ensure_connected does not pass when eval fails', async () => {
        const run = await runHarness(['connect-check'], { STUB_FAIL: '( eval | wait --fn )' });
        assert.notEqual(run.status, 0, run.stdout + run.stderr);
        assert.doesNotMatch(run.stdout, /all flows passed/);
    });

    test('ensure_connected connects through Connect Wallet when auto-connect does not come', async () => {
        const run = await runHarness(['connect-check'], { STUB_FAIL: 'wait --fn .* --timeout 5000$' }, [
            WALLET_PRESENT,
            CONNECT_BUTTON_SHOWN,
        ]);
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.ok(
            run.calls.includes('--session st find role button click --name Connect Wallet'),
            run.calls.join('\n'),
        );
        assert.ok(
            run.calls.includes('--session st find role button click --name Mosaic Test Wallet'),
            run.calls.join('\n'),
        );
    });
});

// ---------------------------------------------------------------------------
// Shell scripts: prettier and eslint do not read them
// ---------------------------------------------------------------------------

test('every harness shell script parses', { skip: !HAS_SHELL_TOOLS && 'needs bash' }, () => {
    const scripts = [
        ...readdirSync(HERE).filter(name => name.endsWith('.sh')),
        ...readdirSync(join(HERE, 'flows')).map(name => join('flows', name)),
    ].filter(name => name.endsWith('.sh'));
    assert.ok(scripts.length > 3, `found only ${scripts.join(', ')}`);
    for (const script of scripts) {
        const { status, stderr } = spawnSync('bash', ['-n', join(HERE, script)], { encoding: 'utf8' });
        assert.equal(status, 0, `${script}: ${stderr}`);
    }
});
