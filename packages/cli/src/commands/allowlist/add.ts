import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createAddToAllowlistTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface AddOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
}

export const addCommand = new Command('add')
  .description('Add an account to the allowlist')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-a, --account <account>',
    'The account to add to the allowlist (wallet address)'
  )
  .showHelpAfterError()
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: cmd => cmd.name(),
  })
  .action(async (options: AddOptions, command) => {
    const spinner = ora('Adding account to allowlist...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load authority keypair (assuming it's the configured keypair)
      const authorityKeypair = await loadKeypair(keypairPath);

      spinner.text = 'Building add transaction...';

      // Create add transaction
      const transaction = await createAddToAllowlistTransaction(
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

      spinner.succeed('Account added to allowlist successfully!');

      // Display results
      console.log(chalk.green('✅ Added account to allowlist'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Authority:')} ${authorityKeypair.address}`);
    } catch (error) {
      spinner.fail('Failed to add account to allowlist');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
