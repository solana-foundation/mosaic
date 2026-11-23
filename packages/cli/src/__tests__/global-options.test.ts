import { Command } from 'commander';
import type { OptionValues } from 'commander';
import { addGlobalOptions, getGlobalOpts } from '../utils/global-options';

/**
 * Builds a program shaped like the real one: global options on the root, a top-level command
 * (`mint`) and a nested one (`create stablecoin`), each recording what `getGlobalOpts` sees.
 */
function buildProgram() {
    const seen: { mint?: OptionValues; create?: OptionValues } = {};
    const program = addGlobalOptions(new Command('mosaic')).exitOverride();
    program.command('mint').action((_opts, cmd: Command) => {
        seen.mint = getGlobalOpts(cmd);
    });
    program
        .command('create')
        .command('stablecoin')
        .action((_opts, cmd: Command) => {
            seen.create = getGlobalOpts(cmd);
        });
    return { program, seen };
}

describe('global options', () => {
    it('declares --raw-tx with no default value (HOO-962 bug 1)', () => {
        const { program } = buildProgram();
        const rawTx = program.options.find(option => option.long === '--raw-tx');
        expect(rawTx).toBeDefined();
        expect(rawTx?.defaultValue).toBeUndefined();
    });

    it.each([
        ['a top-level command', ['mint'], 'mint'],
        ['a nested command', ['create', 'stablecoin'], 'create'],
    ] as const)('leaves raw mode off for %s when --raw-tx is not passed', (_label, args, key) => {
        const { program, seen } = buildProgram();
        program.parse(['node', 'mosaic', ...args, '--keypair', 'kp.json']);
        expect(seen[key]?.rawTx).toBeUndefined();
        expect(seen[key]?.keypair).toBe('kp.json');
    });

    it.each([
        ['a top-level command', ['mint'], 'mint'],
        ['a nested command', ['create', 'stablecoin'], 'create'],
    ] as const)('turns raw mode on for %s when --raw-tx is passed after it', (_label, args, key) => {
        const { program, seen } = buildProgram();
        program.parse(['node', 'mosaic', ...args, '--raw-tx', 'b58', '--authority', 'A', '--fee-payer', 'F']);
        expect(seen[key]).toMatchObject({ rawTx: 'b58', authority: 'A', feePayer: 'F' });
    });

    it('leaves --rpc-url unset when it is not passed, so the Solana CLI config can apply', () => {
        const { program, seen } = buildProgram();
        const rpcUrl = program.options.find(option => option.long === '--rpc-url');
        expect(rpcUrl?.defaultValue).toBeUndefined();
        program.parse(['node', 'mosaic', 'mint']);
        expect(seen.mint?.rpcUrl).toBeUndefined();
    });

    it('passes --rpc-url through when it is given', () => {
        const { program, seen } = buildProgram();
        program.parse(['node', 'mosaic', 'mint', '--rpc-url', 'http://127.0.0.1:8899']);
        expect(seen.mint?.rpcUrl).toBe('http://127.0.0.1:8899');
    });
});
