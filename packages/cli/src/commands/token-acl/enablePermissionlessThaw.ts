import { Command } from 'commander';
import chalk from 'chalk';
import { getEnablePermissionlessThawTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import {
  signTransactionMessageWithSigners,
  type Address,
  type TransactionSigner,
} from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
}

export const enablePermissionlessThaw = new Command(
  'enable-permissionless-thaw'
)
  .description('Enable permissionless thaw for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .action(async (options: CreateConfigOptions, command) => {
    const parentOpts = getGlobalOpts(command);
    const rpcUrl = parentOpts.rpcUrl;
    const rawTx: string | undefined = parentOpts.rawTx;
    const spinner = createSpinner('Enabling permissionless thaw...', rawTx);

    try {
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      spinner.text = `Using RPC URL: ${rpcUrl}`;

      const kp = rawTx ? null : await loadKeypair(parentOpts.keypair);

      spinner.text = 'Building transaction...';

      const payer = (
        rawTx
          ? ((parentOpts.feePayer ||
              (await getAddressFromKeypair(parentOpts.keypair))) as Address)
          : kp
      ) as TransactionSigner<string>;
      const authority = (
        rawTx
          ? ((parentOpts.authority ||
              (await getAddressFromKeypair(parentOpts.keypair))) as Address)
          : kp
      ) as TransactionSigner<string>;

      const transaction = await getEnablePermissionlessThawTransaction({
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
