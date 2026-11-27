import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { platform } from 'os';

const config = {
    // How long to wait for the validator's RPC to answer. A cold `solana-test-validator -r` on a
    // CI runner can need more than 10s to build its ledger, which flaked the old 10-try budget.
    startupTimeoutMs: parseInt(process.env.SOLANA_VALIDATOR_STARTUP_TIMEOUT_MS) || 60_000,
    // Short epochs so the rate-extension tests can check that the on-chain transfer fee epoch
    // comes from the cluster clock; with the default 432000 slots the cluster stays at epoch 0,
    // which is indistinguishable from the client-side `0n` placeholder (HOO-1684, HOO-1714).
    validatorArgs: (process.env.SOLANA_VALIDATOR_ARGS || '-r --slots-per-epoch 32').split(' '),
    rpcUrl: 'http://127.0.0.1:8899',
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
    try {
        const checkProcess = spawn('solana', ['--version'], { stdio: 'pipe' });
        const exitCode = await new Promise(resolve => {
            checkProcess.on('close', resolve);
        });

        if (exitCode !== 0) {
            throw new Error();
        }
    } catch (error) {
        console.error('Solana CLI not found. Please install: https://docs.solana.com/cli/install-solana-cli-tools');
        process.exit(1);
    }
}

async function waitForValidator() {
    console.log('Waiting for validator to be ready...');

    const deadline = Date.now() + config.startupTimeoutMs;
    while (Date.now() < deadline) {
        if (validatorExit) {
            throw startupError(`Validator exited during startup with ${validatorExit}`);
        }

        try {
            // Target the local validator explicitly: without `--url` the CLI uses its config
            // file, which may point at a live cluster and pass before the validator is up.
            const checkProcess = spawn('solana', ['cluster-version', '--url', config.rpcUrl], {
                stdio: 'pipe',
            });
            const exitCode = await new Promise(resolve => {
                checkProcess.on('close', resolve);
            });

            if (exitCode === 0) {
                console.log('Validator is ready!');
                await setTimeout(2_000);
                return;
            }
        } catch (error) {
            // Continue waiting
        }

        await setTimeout(1000);
    }

    throw startupError(`Validator did not answer on ${config.rpcUrl} within ${config.startupTimeoutMs / 1000}s`);
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

        await waitForValidator();

        console.log('Running tests...');
        const testProcess = spawn('jest', ['__tests__/integration'], {
            stdio: 'inherit',
            shell: platform() === 'win32', // Windows compatibility
        });

        const testExitCode = await new Promise(resolve => {
            testProcess.on('close', resolve);
        });

        console.log(`Tests completed with exit code: ${testExitCode}`);
        process.exit(testExitCode);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

function cleanup() {
    if (validatorProcess && !validatorProcess.killed && !validatorExit) {
        console.log('Shutting down Solana test validator...');

        // Graceful shutdown
        validatorProcess.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
            if (validatorProcess && !validatorProcess.killed) {
                validatorProcess.kill('SIGKILL');
            }
        }, 5000);
    }
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    cleanup();
    process.exit(1);
});

runTestsWithValidator();
