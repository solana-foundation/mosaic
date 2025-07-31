import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getRemoveWalletTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import { ABL_PROGRAM_ID } from '@mosaic/sdk';
import { findListConfigPda } from '@mosaic/abl';

interface RemoveOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
}

export const removeCommand = new Command('remove')
  .description('Remove an account from the access list')
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
    const spinner = ora('Removing account from access list...').start();

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

      const listConfigPda = await findListConfigPda(
        {
          authority: authorityKeypair.address,
          seed: options.mintAddress as Address,
        },
        { programAddress: ABL_PROGRAM_ID }
      );

      // Create add transaction
      const transaction = await getRemoveWalletTransaction({
        rpc,
        payer: authorityKeypair,
        authority: authorityKeypair,
        wallet: options.account as Address,
        list: listConfigPda[0],
      });

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Account removed from access list successfully!');

      // Display results
      console.log(chalk.green('✅ Removed account from access list'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Authority:')} ${authorityKeypair.address}`);
    } catch (error) {
      spinner.fail('Failed to remove account from access list');
      console.error(
        chalk.red('\\n❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
