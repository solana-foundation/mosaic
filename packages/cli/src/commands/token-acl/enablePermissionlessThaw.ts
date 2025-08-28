import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getEnablePermissionlessThawTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
}

export const enablePermissionlessThaw = new Command(
  'enable-permissionless-thaw'
)
  .description('Enable permissionless thaw for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Enabling permissionless thaw...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      spinner.text = 'Building transaction...';

      const transaction = await getEnablePermissionlessThawTransaction({
        rpc,
        payer: kp,
        authority: kp,
        mint: options.mint as Address,
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

      spinner.succeed('Permissionless thaw enabled successfully!');

      // Display results
      console.log(chalk.green('✅ Permissionless thaw enabled successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to enable permissionless thaw');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
