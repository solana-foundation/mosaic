import { Command } from 'commander';
import chalk from 'chalk';
import { getTokenPauseState } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { type Address } from 'gill';
import { getGlobalOpts, createSpinner } from '../../utils/cli.js';

interface StatusOptions {
    mintAddress: string;
}

export const statusCommand = new Command('status')
    .description('Check token pause status')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token to check')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: StatusOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;

        const spinner = createSpinner('Checking token pause status...');

        try {
            // Create Solana client
            const { rpc } = createSolanaClient(rpcUrl);

            // Check current pause state
            const isPaused = await getTokenPauseState(rpc, options.mintAddress as Address);

            spinner.stop();

            // Display status
            console.log(chalk.cyan('\\n📋 Token Pause Status'));
            console.log(chalk.cyan('━'.repeat(50)));
            console.log(`${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(
                `${chalk.bold('Status:')} ${
                    isPaused
                        ? chalk.red('🔒 PAUSED - Transfers are blocked')
                        : chalk.green('✅ ACTIVE - Transfers are enabled')
                }`,
            );
            console.log(chalk.cyan('━'.repeat(50)));

            if (isPaused) {
                console.log();
                console.log(chalk.yellow('ℹ️  Token is currently paused:'));
                console.log('   • No transfers can be executed');
                console.log('   • Token holders cannot send or receive');
                console.log('   • Use "mosaic control resume" command to resume transfers');
            } else {
                console.log();
                console.log(chalk.green('ℹ️  Token is active:'));
                console.log('   • All transfers are enabled');
                console.log('   • Token operates normally');
                console.log('   • Use "mosaic control pause" command to pause if needed');
            }
        } catch (error) {
            spinner.fail('Failed to check pause status');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
