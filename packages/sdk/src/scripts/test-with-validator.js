import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { platform } from 'os';

const config = {
    validatorStartupTime: parseInt(process.env.SOLANA_VALIDATOR_STARTUP_TIME) || 3000,
    // Short epochs so the rate-extension tests can check that the on-chain transfer fee epoch
    // comes from the cluster clock; with the default 432000 slots the cluster stays at epoch 0,
    // which is indistinguishable from the client-side `0n` placeholder (HOO-1684, HOO-1714).
    validatorArgs: (process.env.SOLANA_VALIDATOR_ARGS || '-r --slots-per-epoch 32').split(' '),
    maxHealthCheckRetries: 10,
};

let validatorProcess = null;

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

    for (let i = 0; i < config.maxHealthCheckRetries; i++) {
        try {
            // Target the local validator explicitly: without `--url` the CLI uses its config
            // file, which may point at a live cluster and pass before the validator is up.
            const checkProcess = spawn('solana', ['cluster-version', '--url', 'http://127.0.0.1:8899'], {
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

    throw new Error('Validator failed to start within timeout period');
}

async function runTestsWithValidator() {
    try {
        await checkSolanaCLI();

        console.log('Starting Solana test validator...');
        validatorProcess = spawn('solana-test-validator', config.validatorArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
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
    if (validatorProcess && !validatorProcess.killed) {
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
