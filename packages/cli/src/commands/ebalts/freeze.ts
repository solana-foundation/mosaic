import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getFreezeTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface CreateConfigOptions {
  tokenAccount: string;
  rpcUrl?: string;
  keypair?: string;
}

export const freeze = new Command('freeze')
  .description('Freeze a token account')
  .requiredOption(
    '-t, --token-account <token-account>',
    'Token account address'
  )
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Freezing token account...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      const transaction = await getFreezeTransaction({
        rpc,
        payer: kp,
        authority: kp,
        tokenAccount: options.tokenAccount as Address,
      });

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction, {
        skipPreflight: true,
        commitment: 'confirmed',
      });

      spinner.succeed('Token account frozen successfully!');

      // Display results
      console.log(chalk.green('✅ Token account frozen successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Token Account:')} ${options.tokenAccount}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to freeze token account');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
