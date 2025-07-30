import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createThawAccountTransaction, resolveTokenAccount } from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { loadKeypair } from '../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface ThawOptions {
  mintAddress: string;
  account: string;
  rpcUrl?: string;
  keypair?: string;
}

export const thawCommand = new Command('thaw')
  .description('Thaw a token account')
  .requiredOption(
    '-m, --mint-address <mint-address>',
    'The mint address of the token'
  )
  .requiredOption(
    '-a, --account <account>',
    'The account to thaw (wallet address or ATA address)'
  )
  .action(async (options: ThawOptions, command) => {
    const spinner = ora('Thawing account...').start();

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

      spinner.text = 'Building thaw transaction...';

      // Create thaw transaction
      const transaction = await createThawAccountTransaction(
        rpc,
        options.mintAddress as Address,
        options.account as Address,
        freezeAuthorityKeypair,
        freezeAuthorityKeypair // Use same keypair as fee payer
      );

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction);

      spinner.succeed('Account thawed successfully!');

      // Display results
      console.log(chalk.green('✅ Thaw Transaction Successful'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
      console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
      console.log(`   ${chalk.bold('Token Account:')} ${tokenAccount}`);
      if (wasOwnerAddress) {
        console.log(
          `   ${chalk.bold('Account Type:')} Derived ATA from wallet address`
        );
      } else {
        console.log(
          `   ${chalk.bold('Account Type:')} Direct token account address`
        );
      }
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
      console.log(
        `   ${chalk.bold('Freeze Authority:')} ${freezeAuthorityKeypair.address}`
      );

      console.log(chalk.cyan('\\n🌡️ Result:'));
      console.log(`   ${chalk.green('✓')} Token account is now thawed`);
      console.log(
        `   ${chalk.green('✓')} Tokens can now be transferred from this account`
      );
    } catch (error) {
      spinner.fail('Failed to thaw account');
      console.error(
        chalk.red('\\n❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
