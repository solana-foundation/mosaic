import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createRemoveFromBlocklistTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface RemoveOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
}

export const removeCommand = new Command('remove')
  .description('Remove an account from the blocklist')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-a, --account <account>',
    'The account to freeze (wallet address)'
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: RemoveOptions, command) => {
    const spinner = ora('Removing account from blocklist...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load authority keypair (assuming it's the configured keypair)
      const authorityKeypair = await loadKeypair(keypairPath);

      spinner.text = 'Building remove transaction...';

      // Create remove transaction
      const transaction = await createRemoveFromBlocklistTransaction(
        rpc,
        options.mintAddress as Address,
        options.account as Address,
        authorityKeypair
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Account removed from blocklist successfully!');

      // Display results
      console.log(chalk.green('✅ Removed account from blocklist'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Authority:')} ${authorityKeypair.address}`);
    } catch (error) {
      spinner.fail('Failed to remove account from blocklist');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
