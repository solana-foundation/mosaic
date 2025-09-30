import { Command } from 'commander';
import chalk from 'chalk';
import { unpauseToken, getTokenPauseState } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { type Address } from 'gill';
import { getGlobalOpts, createSpinner } from '../../utils/cli.js';

interface ResumeOptions {
  mintAddress: string;
}

export const resumeCommand = new Command('resume')
  .description('Resume token transfers (unpause)')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token to resume'
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: ResumeOptions, command) => {
    // Get global options from parent command
    const parentOpts = getGlobalOpts(command);
    const rpcUrl = parentOpts.rpcUrl;
    const keypairPath = parentOpts.keypair;
    const rawTx: string | undefined = parentOpts.rawTx;

    const spinner = createSpinner('Checking token state...', rawTx);

    try {
      // Create Solana client
      const { rpc } = createSolanaClient(rpcUrl);

      // Check current pause state
      spinner.text = 'Checking current pause state...';
      const currentlyPaused = await getTokenPauseState(
        rpc,
        options.mintAddress as Address
      );

      if (!currentlyPaused) {
        spinner.warn('Token is not paused');
        console.log(
          chalk.yellow('⚠️  Token is not currently paused. No action needed.')
        );
        process.exit(0);
      }

      spinner.text = 'Preparing resume transaction...';

      // Resolve pause authority signer or address
      const { signer: pauseAuthority, address: pauseAuthorityAddress } =
        await resolveSigner(rawTx, keypairPath, parentOpts.authority);

      spinner.text = 'Sending resume transaction...';

      // Execute unpause transaction (resume)
      const result = await unpauseToken(rpc, {
        mint: options.mintAddress as Address,
        pauseAuthority,
        feePayer: pauseAuthority, // Use same signer for fee payer
      });

      // Check if this is a placeholder result (temporary until Token-2022 pause is available)
      if (!result.success && result.error?.includes('not yet implemented')) {
        spinner.warn('Resume functionality pending Token-2022 implementation');
        console.log();
        console.log(chalk.yellow('ℹ️  Note:'));
        console.log(
          chalk.white(
            '   Resume functionality is pending Token-2022 pause instruction availability.'
          )
        );
        console.log(
          chalk.white(
            '   The transaction structure is ready and will work once the protocol supports it.'
          )
        );

        if (rawTx) {
          console.log();
          console.log(chalk.cyan('📋 Command prepared for:'));
          console.log(
            `   ${chalk.bold('Mint Address:')} ${options.mintAddress}`
          );
          console.log(
            `   ${chalk.bold('Pause Authority:')} ${pauseAuthorityAddress}`
          );
        }
        process.exit(0);
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to resume token');
      }

      spinner.succeed('Token resumed successfully!');

      // Display results
      console.log(chalk.green('\\n✅ Token Resumed Successfully'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      if (result.transactionSignature) {
        console.log(
          `   ${chalk.bold('Transaction:')} ${result.transactionSignature}`
        );
      }
      console.log(
        `   ${chalk.bold('Pause Authority:')} ${pauseAuthorityAddress}`
      );
      console.log(
        `   ${chalk.bold('Status:')} Token transfers are now enabled`
      );

      console.log(chalk.cyan('\\n🎯 Result:'));
      console.log(`   ${chalk.green('✓')} Token is now active`);
      console.log(`   ${chalk.green('✓')} All transfers can proceed normally`);
      console.log(
        `   ${chalk.green('✓')} DeFi protocols can interact with the token`
      );
    } catch (error) {
      spinner.fail('Failed to resume token');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
