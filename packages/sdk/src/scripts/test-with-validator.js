import { spawn } from 'child_process';
import { commandExitCode, installCleanup, spawnJest, waitForHealthy } from './local-cluster.js';

// SOLANA_RPC_PORT moves the validator off its default 8899 (the WebSocket port is always RPC + 1).
const rpcPort = process.env.SOLANA_RPC_PORT;
const port = parseInt(rpcPort || '8899', 10);

const config = {
    validatorArgs: [
        ...(process.env.SOLANA_VALIDATOR_ARGS || '-r').split(' '),
        ...(rpcPort ? ['--rpc-port', String(port)] : []),
    ],
    rpcUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port + 1}`,
    maxHealthCheckRetries: 30,
};

let validatorProcess = null;

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

        // Handle validator errors
        validatorProcess.on('error', error => {
            console.error('Failed to start validator:', error.message);
            process.exit(1);
        });

        await waitForHealthy(config.rpcUrl, config.maxHealthCheckRetries);

        console.log('Running tests...');
        const testExitCode = await spawnJest(['__tests__/integration'], {
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
