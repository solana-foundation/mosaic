import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createAddToBlocklistTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';

interface AddOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
  authority?: string;
}

export const addCommand = new Command('add')
  .description('Add an account to the blocklist')
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
  .action(async (options: AddOptions, command) => {
    const spinner = ora('Adding account to blocklist...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;
      const rawTx: string | undefined = parentOpts.rawTx;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Resolve authority signer or address
      const { signer: authoritySigner, address: authorityAddress } = await resolveSigner(
        rawTx,
        keypairPath,
        options.authority
      );

      spinner.text = 'Building add transaction...';

      // Create add transaction
      const transaction = await createAddToBlocklistTransaction(
        rpc,
        options.mintAddress as Address,
        options.account as Address,
        authoritySigner
      );

      if (maybeOutputRawTx(rawTx, transaction)) {
        spinner.succeed('Built unsigned transaction');
        return;
      }

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction = await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Account added to blocklist successfully!');

      // Display results
      console.log(chalk.green('✅ Added account to blocklist'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Authority:')} ${authorityAddress}`);
    } catch (error) {
      spinner.fail('Failed to add account to blocklist');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error : 'Unknown error'
      );
      process.exit(1);
    }
  });
