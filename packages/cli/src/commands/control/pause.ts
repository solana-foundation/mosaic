import { Command } from 'commander';
import chalk from 'chalk';
import { type Address } from 'gill';
import { createPauseTransaction, MINT_ALREADY_PAUSED_ERROR } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc';
import { resolveSigner } from '../../utils/solana';
import {
  getGlobalOpts,
  createSpinner,
  sendOrOutputTransaction,
} from '../../utils/cli';

interface PauseOptions {
  mintAddress: string;
  skipWarning?: boolean;
}

export const pauseCommand = new Command('pause')
  .description('Pause a token to prevent all transfers')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token to pause'
  )
  .option(
    '--skip-warning',
    'Skip the warning message (use with caution)',
    false
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: PauseOptions, command) => {
    // Get global options from parent command
    const parentOpts = getGlobalOpts(command);
    const rpcUrl = parentOpts.rpcUrl;
    const keypairPath = parentOpts.keypair;
    const rawTx: string | undefined = parentOpts.rawTx;

    const spinner = createSpinner('Checking token state...', rawTx);

    try {
      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Show warning if not skipped
      if (!options.skipWarning && !rawTx) {
        spinner.stop();
        console.log(chalk.yellow('\\n⚠️  WARNING: Pausing Token'));
        console.log(chalk.yellow('━'.repeat(50)));
        console.log(chalk.white('You are about to pause the token at:'));
        console.log(chalk.cyan(`  ${options.mintAddress}`));
        console.log();
        console.log(chalk.red('This will:'));
        console.log(chalk.red('  • Prevent ALL token transfers'));
        console.log(
          chalk.red('  • Block token holders from sending or receiving')
        );
        console.log(chalk.red('  • Potentially disrupt DeFi protocols'));
        console.log(chalk.red('  • Require pause authority to unpause'));
        console.log();
        console.log(
          chalk.yellow(
            'This is a sensitive operation that affects all token holders.'
          )
        );
        console.log(
          chalk.yellow(
            'Use --skip-warning flag to bypass this message if you are sure.'
          )
        );
        console.log(chalk.yellow('━'.repeat(50)));
        console.log();
        console.log(
          chalk.blue('Run the command with --skip-warning to proceed.')
        );
        process.exit(0);
      }

      spinner.start('Preparing pause transaction...');

      // Resolve pause authority signer or address
      const { signer: pauseAuthority, address: pauseAuthorityAddress } =
        await resolveSigner(rawTx, keypairPath, parentOpts.authority);

      spinner.text = 'Sending pause transaction...';

      const { transactionMessage } = await createPauseTransaction(rpc, {
        mint: options.mintAddress as Address,
        pauseAuthority,
        feePayer: parentOpts.feePayer || pauseAuthority,
      });

      const { raw, signature } = await sendOrOutputTransaction(
        transactionMessage,
        rawTx,
        spinner,
        tx =>
          sendAndConfirmTransaction(tx, {
            skipPreflight: true,
            commitment: 'confirmed',
          })
      );
      if (raw) return;

      spinner.succeed('Token paused successfully!');

      // Display results
      console.log(chalk.green('\\n✅ Token Paused Successfully'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      if (signature) {
        console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      }
      console.log(
        `   ${chalk.bold('Pause Authority:')} ${pauseAuthorityAddress}`
      );
      console.log(
        `   ${chalk.bold('Status:')} Token transfers are now blocked`
      );

      console.log(chalk.cyan('\\n🎯 Next Steps:'));
      console.log(
        `   • Use ${chalk.bold('mosaic control resume')} command to resume transfers`
      );
      console.log(`   • Monitor token holder communications`);
      console.log(`   • Ensure pause authority is secure`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === MINT_ALREADY_PAUSED_ERROR
      ) {
        spinner.warn('Token is already paused');
        console.log(
          chalk.yellow(
            '⚠️  Token is already paused. Use "mosaic control resume" command to resume token functionality.'
          )
        );
        process.exit(0);
      }

      spinner.fail('Failed to pause token');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
