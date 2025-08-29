import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getThawTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';

interface CreateConfigOptions {
  tokenAccount: string;
  rpcUrl?: string;
  keypair?: string;
  payer?: string;
  authority?: string;
}

export const thaw = new Command('thaw')
  .description('Thaw a token account')
  .requiredOption(
    '-t, --token-account <token-account>',
    'Token account address'
  )
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Thawing token account...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const rawTx: string | undefined = parentOpts.rawTx;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = rawTx ? null : await loadKeypair(options.keypair);

      const payer = (rawTx
        ? ((options.payer || (await getAddressFromKeypair(options.keypair))) as Address)
        : kp) as any;
      const authority = (rawTx
        ? ((options.authority || (await getAddressFromKeypair(options.keypair))) as Address)
        : kp) as any;

      const transaction = await getThawTransaction({
        rpc,
        payer,
        authority,
        tokenAccount: options.tokenAccount as Address,
      });

      if (maybeOutputRawTx(rawTx, transaction)) {
        spinner.succeed('Built unsigned transaction');
        return;
      }

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

      spinner.succeed('Thawing token account successfully!');

      // Display results
      console.log(chalk.green('✅ Thawing token account successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Token Account:')} ${options.tokenAccount}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to thaw token account');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
