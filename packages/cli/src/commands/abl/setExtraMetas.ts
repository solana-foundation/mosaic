import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getSetExtraMetasTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';

interface CreateConfigOptions {
  mint: string;
  list: string;
  rpcUrl?: string;
  keypair?: string;
  payer?: string;
  authority?: string;
}

export const setExtraMetas = new Command('set-extra-metas')
  .description('Set extra metas for an existing list')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .requiredOption('-l, --list <list>', 'List address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Setting extra metas...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const rawTx: string | undefined = parentOpts.rawTx;
      const keypairPath = options.keypair || parentOpts.keypair;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = rawTx ? null : await loadKeypair(keypairPath);

      const payer = (rawTx
        ? ((options.payer || (await getAddressFromKeypair(keypairPath))) as Address)
        : kp) as any;
      const authority = (rawTx
        ? ((options.authority || (await getAddressFromKeypair(keypairPath))) as Address)
        : kp) as any;

      const transaction = await getSetExtraMetasTransaction({
        rpc,
        payer,
        authority,
        mint: options.mint as Address,
        list: options.list as Address,
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

      spinner.succeed('Extra metas set successfully!');

      // Display results
      console.log(chalk.green('✅ Extra metas set successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to set extra metas');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
