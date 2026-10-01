import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { platform } from 'os';

// Shared skeleton for the integration runners (test-with-validator.js, test-with-surfpool.js):
// spawn a local cluster, wait for its RPC to report healthy, run jest against it, and make sure
// the cluster is torn down however the run ends.

/** Exit code of `command args`, or null if it could not be spawned at all. */
export async function commandExitCode(command, args) {
    try {
        const proc = spawn(command, args, { stdio: 'ignore' });
        return await new Promise(resolve => {
            proc.on('error', () => resolve(null));
            proc.on('close', resolve);
        });
    } catch {
        return null;
    }
}

/** Stdout of `command args`, or null if it could not be spawned or exited non-zero. */
export async function commandOutput(command, args) {
    try {
        const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        let out = '';
        proc.stdout.on('data', chunk => (out += chunk));
        const code = await new Promise(resolve => {
            proc.on('error', () => resolve(null));
            proc.on('close', resolve);
        });
        return code === 0 ? out : null;
    } catch {
        return null;
    }
}

/**
 * Poll the RPC's getHealth until it answers "ok". Queries the URL directly, so a healthy
 * remote cluster in the ambient `solana config` can't make a local one look ready.
 */
export async function waitForHealthy(rpcUrl, retries, intervalMs = 1000) {
    console.log(`Waiting for ${rpcUrl} to be healthy...`);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{"jsonrpc":"2.0","id":1,"method":"getHealth"}',
            });
            const body = await res.json();
            if (body.result === 'ok') {
                console.log('Cluster is ready!');
                return;
            }
        } catch {
            // Not listening yet
        }
        await setTimeout(intervalMs);
    }
    throw new Error(`${rpcUrl} did not become healthy within ${(retries * intervalMs) / 1000}s`);
}

/** Run jest with `args` and the extra `env`, resolving to its exit code. */
export async function spawnJest(args, env) {
    const testProcess = spawn('jest', args, {
        stdio: 'inherit',
        env: { ...process.env, ...env },
        shell: platform() === 'win32', // Windows compatibility
    });
    return new Promise(resolve => {
        testProcess.on('close', resolve);
    });
}

/**
 * SIGTERM `getProc()`'s process whenever this process exits. Only synchronous work runs in an
 * 'exit' handler, so there is no delayed SIGKILL fallback; both clusters exit on SIGTERM.
 */
export function installCleanup(name, getProc) {
    function cleanup() {
        const proc = getProc();
        if (proc && proc.exitCode === null && !proc.killed) {
            console.log(`Shutting down ${name}...`);
            proc.kill('SIGTERM');
        }
    }

    process.on('exit', cleanup);
    process.on('SIGINT', () => {
        cleanup();
        process.exit(130);
    });
    process.on('SIGTERM', () => {
        cleanup();
        process.exit(143);
    });
    process.on('uncaughtException', error => {
        console.error('Uncaught exception:', error);
        cleanup();
        process.exit(1);
    });
}
