import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCreateListTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { type Address, signTransactionMessageWithSigners } from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
  payer?: string;
  authority?: string;
}

export const createList = new Command('create-list')
  .description('Create a new list for an existing mint')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Creating Token ACL config...').start();

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

      const { transaction, listConfig } = await getCreateListTransaction({
        rpc,
        payer,
        authority,
        mint: options.mint as Address,
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

      spinner.succeed('ABL list created successfully!');

      // Display results
      console.log(chalk.green('✅ ABL list created successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('List Config:')} ${listConfig}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to create ABL list');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
