import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { resolveSigner } from '../../utils/solana.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { printResult, readGlobalOpts, resolveFeePayer, resolveTokenAccount, withErrorHandling } from './common.js';

interface CreditsOptions {
    mint: string;
    tokenAccount?: string;
    nonConfidential?: boolean;
}

/**
 * Builds an enable/disable-credits subcommand. Confidential credits gate incoming
 * confidential transfers; the `--non-confidential` flag toggles the plaintext-transfer
 * credits instead. The SDK confidential module (which pulls in WASM) is imported
 * lazily inside the action so it only loads when the command actually runs.
 */
function makeCreditsCommand(action: 'enable' | 'disable', description: string): Command {
    const name = action === 'enable' ? 'enable-credits' : 'disable-credits';
    return new Command(name)
        .description(description)
        .requiredOption('-m, --mint <address>', 'The token mint')
        .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
        .option('--non-confidential', 'Toggle non-confidential (plaintext) credits instead of confidential ones', false)
        .showHelpAfterError()
        .action(async (options: CreditsOptions, command) => {
            const opts = readGlobalOpts(command);
            const spinner = createSpinner('Updating credit settings...', opts.rawTx);

            await withErrorHandling(spinner, 'Failed to update credit settings', async () => {
                const {
                    createEnableConfidentialCreditsInstructionPlan,
                    createDisableConfidentialCreditsInstructionPlan,
                    createEnableNonConfidentialCreditsInstructionPlan,
                    createDisableNonConfidentialCreditsInstructionPlan,
                } = await import('@solana/mosaic-sdk/confidential');

                const rpc = createRpcClient(opts.rpcUrl);
                const { signer, address } = await resolveSigner(opts.rawTx, opts.keypairPath, opts.authority);
                const mint = options.mint as Address;
                const tokenAccount = await resolveTokenAccount(mint, address, options.tokenAccount);
                const feePayer = resolveFeePayer(opts, signer);

                const build =
                    action === 'enable'
                        ? options.nonConfidential
                            ? createEnableNonConfidentialCreditsInstructionPlan
                            : createEnableConfidentialCreditsInstructionPlan
                        : options.nonConfidential
                          ? createDisableNonConfidentialCreditsInstructionPlan
                          : createDisableConfidentialCreditsInstructionPlan;

                const plan = build({ tokenAccount, authority: signer });
                const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts.rawTx, spinner);
                if (raw) return;

                const kind = options.nonConfidential ? 'non-confidential' : 'confidential';
                const verb = action === 'enable' ? 'enabled' : 'disabled';
                spinner.succeed(`Credits ${verb}!`);
                printResult(`Incoming ${kind} credits ${verb}`, mint, tokenAccount, signatures);
            });
        });
}

export const enableCreditsCommand = makeCreditsCommand('enable', 'Enable incoming credits on a confidential account');
export const disableCreditsCommand = makeCreditsCommand(
    'disable',
    'Disable incoming credits on a confidential account',
);
