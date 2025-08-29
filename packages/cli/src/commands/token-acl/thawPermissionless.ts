import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getThawPermissionlessTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { signTransactionMessageWithSigners, type Address } from 'gill';
import {
  getAssociatedTokenAccountAddress,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';

interface CreateConfigOptions {
  mint: string;
  rpcUrl?: string;
  keypair?: string;
  payer?: string;
  authority?: string;
}

export const thawPermissionless = new Command('thaw-permissionless')
  .description('Thaw permissionless eoas for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Thawing permissionless...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const rawTx: string | undefined = parentOpts.rawTx;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = rawTx ? null : await loadKeypair(options.keypair);

      console.log(options);
      console.log(parentOpts);

      const signerAddress = rawTx
        ? ((options.authority || (await getAddressFromKeypair(options.keypair))) as Address)
        : (kp!.address as Address);
      const mint = options.mint as Address;

      spinner.text = 'Building transaction...';

      const ata = await getAssociatedTokenAccountAddress(
        mint,
        signerAddress,
        TOKEN_2022_PROGRAM_ADDRESS
      );

      const transaction = await getThawPermissionlessTransaction({
        rpc,
        payer: (rawTx ? (signerAddress as Address) : kp) as any,
        authority: (rawTx ? (signerAddress as Address) : kp) as any,
        mint,
        tokenAccount: ata,
        tokenAccountOwner: signerAddress,
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

      spinner.succeed('Permissionless thawed successfully!');

      // Display results
      console.log(chalk.green('✅ Permissionless thawed successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Token Account:')} ${ata}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    } catch (error) {
      spinner.fail('Failed to thaw permissionless');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });
