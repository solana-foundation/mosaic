import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCreateConfigTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import { maybeOutputRawTx } from '../../utils/rawTx.js';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
  payer?: string;
  authority?: string;
}

export const createConfig = new Command('create')
  .description('Create a new Token ACL config for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .option('-g, --gating-program <gating-program>', 'Gating program address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Creating Token ACL config...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const rawTx: string | undefined = parentOpts.rawTx;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = rawTx ? null : await loadKeypair(options.keypair);

      const gatingProgram = (options.gatingProgram ||
        '11111111111111111111111111111111') as Address;

      const payer = (rawTx
        ? ((options.payer || (await getAddressFromKeypair(options.keypair))) as Address)
        : kp) as any;
      const authority = (rawTx
        ? ((options.authority || (await getAddressFromKeypair(options.keypair))) as Address)
        : kp) as any;

      const { transaction, mintConfig } = await getCreateConfigTransaction({
        rpc,
        payer,
        authority,
        mint: options.mint as Address,
        gatingProgram,
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

      spinner.succeed('Token ACL config created successfully!');

      // Display results
      console.log(chalk.green('✅ Token ACL config created successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
      console.log(
        `   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`
      );
      console.log(`   ${chalk.bold('Mint Config:')} ${mintConfig}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to create Token ACL config');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
