import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { resolveSigner } from '../../utils/solana.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { readGlobalOpts, resolveFeePayer, withErrorHandling } from './common.js';

interface ApplyPendingBurnOptions {
    mint: string;
}

export const applyPendingBurnCommand = new Command('apply-pending-burn')
    .description("Apply the mint's accumulated pending burn into its confidential supply (mint authority)")
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .showHelpAfterError()
    .action(async (options: ApplyPendingBurnOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Applying pending burn...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to apply pending burn', async () => {
            const { createApplyConfidentialPendingBurnInstructionPlan } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the mint / supply authority. No confidential keys are
            // derived (no proof), so this can run in --raw-tx mode like `approve`.
            const { signer } = await resolveSigner(opts.rawTx, opts.keypairPath, opts.authority);
            const mint = options.mint as Address;
            const feePayer = resolveFeePayer(opts, signer);

            const plan = createApplyConfidentialPendingBurnInstructionPlan({ mint, authority: signer });
            const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts.rawTx, spinner);
            if (raw) return;
            spinner.succeed('Pending burn applied!');
            console.log(chalk.green('\n✅ Pending Burn Applied'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint:')} ${mint}`);
            if (signatures && signatures.length > 0) {
                signatures.forEach((sig, i) => {
                    const label = signatures.length > 1 ? `Transaction ${i + 1}:` : 'Transaction:';
                    console.log(`   ${chalk.bold(label)} ${sig}`);
                });
            }
        });
    });
