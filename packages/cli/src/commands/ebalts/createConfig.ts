import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCreateConfigTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
}

export const createConfig = new Command('create')
  .description('Create a new ebalts config for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .option('-g, --gating-program <gating-program>', 'Gating program address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Creating ebalts config...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      const gatingProgram = (options.gatingProgram ||
        '11111111111111111111111111111111') as Address;

      const { transaction, mintConfig } = await getCreateConfigTransaction({
        rpc,
        payer: kp,
        authority: kp,
        mint: options.mint as Address,
        gatingProgram,
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

      spinner.succeed('Ebalts config created successfully!');

      // Display results
      console.log(chalk.green('✅ Ebalts config created successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
      console.log(
        `   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`
      );
      console.log(`   ${chalk.bold('Mint Config:')} ${mintConfig}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to create ebalts config');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
