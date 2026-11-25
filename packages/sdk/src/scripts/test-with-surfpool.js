import { spawn } from 'child_process';
import { commandOutput, installCleanup, jestPassthroughArgs, spawnJest, waitForHealthy } from './local-cluster.js';

// Runs the integration suite against surfpool: a litesvm-backed local cluster that lazily forks a
// remote datasource, so the deployed Token ACL / Gate programs are available without deploying
// them. solana-test-validator (test-with-validator.js) stays the required, network-free leg.
//
// The surfpool version is pinned exactly: its Token-2022 program is the ELF embedded in litesvm,
// so a surfpool bump silently changes the Token-2022 version under test. Bump it deliberately,
// together with .github/actions/setup-surfpool.
const SURFPOOL_VERSION = '1.6.0';

const config = {
    rpcPort: parseInt(process.env.SURFPOOL_RPC_PORT || '8899', 10),
    wsPort: parseInt(process.env.SURFPOOL_WS_PORT || '8900', 10),
    // An empty string (e.g. an unset CI secret on a fork) counts as unset.
    datasourceUrl: process.env.SURFPOOL_DATASOURCE_RPC_URL || '',
    allowVersionDrift: process.env.SURFPOOL_ALLOW_VERSION_DRIFT === '1',
    // Boot fetches remote epoch info from the datasource, so allow for a slow RPC.
    maxHealthCheckRetries: 60,
};

let surfpoolProcess = null;

async function checkSurfpool() {
    const output = await commandOutput('surfpool', ['--version']);
    const version = output?.trim().replace(/^surfpool\s+/, '');
    if (version === SURFPOOL_VERSION) return;

    const install = `curl -sL https://run.surfpool.run/ | VERSION=v${SURFPOOL_VERSION} bash`;
    if (output === null) {
        console.error(`surfpool not found. Install the pinned version with:\n  ${install}`);
        process.exit(1);
    }
    const message = `surfpool ${SURFPOOL_VERSION} is required, found ${version}. Install it with:\n  ${install}`;
    if (!config.allowVersionDrift) {
        console.error(`${message}\nSet SURFPOOL_ALLOW_VERSION_DRIFT=1 to run anyway.`);
        process.exit(1);
    }
    console.warn(`Warning: ${message}`);
}

async function runTestsWithSurfpool() {
    try {
        await checkSurfpool();

        // Block production stays on the default `clock` mode (a slot every 400 ms, like a real
        // cluster). `--block-production-mode transaction` was tried and was no faster: run time is
        // dominated by surfpool fetching unknown accounts from the remote datasource.
        const args = [
            'start',
            '--ci',
            '--no-deploy',
            '-y',
            '--port',
            String(config.rpcPort),
            '--ws-port',
            String(config.wsPort),
            ...(config.datasourceUrl ? ['--rpc-url', config.datasourceUrl] : ['--network', 'devnet']),
        ];
        console.log(
            `Starting surfpool (forking ${config.datasourceUrl ? 'SURFPOOL_DATASOURCE_RPC_URL' : 'devnet'})...`,
        );
        // surfpool also reads SURFPOOL_DATASOURCE_RPC_URL natively and rejects it alongside
        // --network, so drop it from the child env once it has been turned into an argument.
        const { SURFPOOL_DATASOURCE_RPC_URL: _datasource, ...env } = process.env;
        surfpoolProcess = spawn('surfpool', args, {
            stdio: ['ignore', 'ignore', 'pipe'],
            detached: false,
            env,
        });
        surfpoolProcess.stderr.on('data', chunk => process.stderr.write(chunk));

        surfpoolProcess.on('error', error => {
            console.error('Failed to start surfpool:', error.message);
            process.exit(1);
        });
        surfpoolProcess.on('exit', code => {
            if (code !== null && code !== 0) {
                console.error(`surfpool exited early with code ${code}`);
                process.exit(1);
            }
        });

        const rpcUrl = `http://127.0.0.1:${config.rpcPort}`;
        await waitForHealthy(rpcUrl, config.maxHealthCheckRetries);

        console.log('Running tests...');
        // One surfpool instance executes everything on a single SVM and resolves every unknown
        // account through the datasource, so parallel jest workers mostly add contention: with
        // workers, dozens of cases time out; in band, the run is green and no slower.
        const testExitCode = await spawnJest(
            ['-c', 'jest.integration.config.js', '--runInBand', ...jestPassthroughArgs()],
            {
                SOLANA_RPC_URL: rpcUrl,
                SOLANA_WS_URL: `ws://127.0.0.1:${config.wsPort}`,
                TEST_BACKEND: 'surfpool',
            },
        );

        console.log(`Tests completed with exit code: ${testExitCode}`);
        process.exit(testExitCode);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

installCleanup('surfpool', () => surfpoolProcess);

runTestsWithSurfpool();
