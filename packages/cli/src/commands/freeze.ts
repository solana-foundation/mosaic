import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createFreezeAccountTransaction, resolveTokenAccount } from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { loadKeypair } from '../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface FreezeOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
}

export const freezeCommand = new Command('freeze')
  .description('Freeze a token account')
  .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
  .requiredOption(
    '-a, --account <account>',
    'The account to freeze (wallet address or ATA address)'
  )
  .action(async (options: FreezeOptions, command) => {
    const spinner = ora('Freezing account...').start();

    try {
      // Get global options from parent command
      const parentOpts = command.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;

      // Create Solana client
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      // Load freeze authority keypair (assuming it's the configured keypair)
      const freezeAuthorityKeypair = await loadKeypair(keypairPath);

      spinner.text = 'Resolving token account...';

      // Resolve the token account (check if ATA or direct token account)
      const { tokenAccount, wasOwnerAddress } = await resolveTokenAccount(
        rpc,
        options.account as Address,
        options.mintAddress as Address
      );

      spinner.text = 'Building freeze transaction...';

      // Create freeze transaction
      const transaction = await createFreezeAccountTransaction(
        rpc,
        options.mintAddress as Address,
        options.account as Address,
        freezeAuthorityKeypair,
        freezeAuthorityKeypair // Use same keypair as fee payer
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction = await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Account frozen successfully!');

      // Display results
      console.log(chalk.green('✅ Freeze Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Token Account:')} ${tokenAccount}`);
      if (wasOwnerAddress) {
        console.log(`   ${chalk.bold('Account Type:')} Derived ATA from wallet address`);
      } else {
        console.log(`   ${chalk.bold('Account Type:')} Direct token account address`);
      }
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(`   ${chalk.bold('Freeze Authority:')} ${freezeAuthorityKeypair.address}`);

      console.log(chalk.cyan('\\n🥶 Result:'));
      console.log(`   ${chalk.green('✓')} Token account is now frozen`);
      console.log(`   ${chalk.yellow('⚠️')}  No tokens can be transferred from this account until thawed`);

    } catch (error) {
      spinner.fail('Failed to freeze account');
      console.error(
        chalk.red('\\n❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });