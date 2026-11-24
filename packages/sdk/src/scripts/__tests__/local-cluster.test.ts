import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

// local-cluster.js is a plain Node ESM script, so drive it from a child Node process: that also
// exercises the runner's real `process.exit(code)` path, which is where a null code turns into 0.
const LOCAL_CLUSTER_URL = pathToFileURL(resolve(__dirname, '..', 'local-cluster.js')).href;

/** Exit status of a runner that exits with whatever `runToExitCode` resolves for `childScript`. */
function runnerExitStatus(childScript: string): number | null {
    const runner = `
        const { runToExitCode } = await import(${JSON.stringify(LOCAL_CLUSTER_URL)});
        process.exit(await runToExitCode(process.execPath, ['-e', ${JSON.stringify(childScript)}]));
    `;
    return spawnSync(process.execPath, ['--input-type=module', '-e', runner], { stdio: 'ignore' }).status;
}

describe('runToExitCode', () => {
    it('passes a normal exit code through', () => {
        expect(runnerExitStatus('process.exit(0)')).toBe(0);
        expect(runnerExitStatus('process.exit(3)')).toBe(3);
    });

    it('fails the run when the child is killed by a signal', () => {
        // A signal-killed child (OOM killer, runner timeout) has no exit code. The runner must not
        // turn that into a passing exit status.
        expect(runnerExitStatus("process.kill(process.pid, 'SIGKILL')")).not.toBe(0);
    });
});
