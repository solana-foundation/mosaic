import { spawn } from 'child_process';
import { commandExitCode, installCleanup, jestPassthroughArgs, spawnJest, waitForHealthy } from './local-cluster.js';

// SOLANA_RPC_PORT moves the validator off its default 8899 (the WebSocket port is always RPC + 1).
const rpcPort = process.env.SOLANA_RPC_PORT;
const port = parseInt(rpcPort || '8899', 10);

const config = {
    // How long to wait for the validator's RPC to answer. A cold `solana-test-validator -r` on a
    // CI runner can need more than 10s to build its ledger, which flaked the old 10-try budget.
    startupTimeoutMs: parseInt(process.env.SOLANA_VALIDATOR_STARTUP_TIMEOUT_MS) || 60_000,
    // Short epochs so the rate-extension tests can check that the on-chain transfer fee epoch
    // comes from the cluster clock; with the default 432000 slots the cluster stays at epoch 0,
    // which is indistinguishable from the client-side `0n` placeholder (HOO-1684, HOO-1714).
    validatorArgs: [
        ...(process.env.SOLANA_VALIDATOR_ARGS || '-r --slots-per-epoch 32').split(' '),
        ...(rpcPort ? ['--rpc-port', String(port)] : []),
    ],
    rpcUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port + 1}`,
};

let validatorProcess = null;
// How the validator exited, once it has: a validator that dies during startup fails the run at
// once with this, instead of waiting out the startup timeout.
let validatorExit = null;
// The tail of the validator's stdout and stderr, printed when it fails to start. Reading the
// pipes also keeps the validator from blocking on a full pipe during a long test run.
let validatorOutput = '';
const VALIDATOR_OUTPUT_LIMIT = 8_000;

function keepValidatorOutput(chunk) {
    validatorOutput = (validatorOutput + chunk).slice(-VALIDATOR_OUTPUT_LIMIT);
}

function startupError(message) {
    const output = validatorOutput.trim();
    return new Error(output ? `${message}\nValidator output:\n${output}` : message);
}

async function checkSolanaCLI() {
    if ((await commandExitCode('solana-test-validator', ['--version'])) !== 0) {
        console.error('Solana CLI not found. Please install: https://docs.solana.com/cli/install-solana-cli-tools');
        process.exit(1);
    }
}

async function runTestsWithValidator() {
    try {
        await checkSolanaCLI();

        console.log('Starting Solana test validator...');
        validatorProcess = spawn('solana-test-validator', config.validatorArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
        });

        validatorProcess.stdout.setEncoding('utf8').on('data', keepValidatorOutput);
        validatorProcess.stderr.setEncoding('utf8').on('data', keepValidatorOutput);
        validatorProcess.on('exit', (code, signal) => {
            validatorExit = signal ? `signal ${signal}` : `exit code ${code}`;
        });

        // Handle validator errors
        validatorProcess.on('error', error => {
            console.error('Failed to start validator:', error.message);
            process.exit(1);
        });

        await waitForHealthy(config.rpcUrl, Math.ceil(config.startupTimeoutMs / 1000), {
            assertAlive() {
                if (validatorExit) throw new Error(`Validator exited during startup with ${validatorExit}`);
            },
        }).catch(error => {
            throw startupError(error.message);
        });

        console.log('Running tests...');
        const testExitCode = await spawnJest(['-c', 'jest.integration.config.js', ...jestPassthroughArgs()], {
            SOLANA_RPC_URL: config.rpcUrl,
            SOLANA_WS_URL: config.wsUrl,
            TEST_BACKEND: 'validator',
        });

        console.log(`Tests completed with exit code: ${testExitCode}`);
        process.exit(testExitCode);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

installCleanup('Solana test validator', () => validatorProcess);

runTestsWithValidator();
