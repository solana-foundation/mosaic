import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createArcadeTokenInitTransaction, getCreateListTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
    compressTransactionMessageUsingAddressLookupTables,
    createTransaction,
  generateKeyPairSigner,
  signTransactionMessageWithSigners,
  SolanaError,
  type Address,
} from 'gill';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
}

export const createList = new Command('create-list')
  .description('Create a new list for an existing mint')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Creating ebalts config...').start();

    try {
        const parentOpts = command.parent?.parent?.opts() || {};
        const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
        const keypairPath = options.keypair || parentOpts.keypair;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      console.log(options);
      console.log(parentOpts);
      
      const {transaction, listConfig} = await getCreateListTransaction({
        rpc,
        payer: kp,
        authority: kp,
      });

      
      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction, { skipPreflight: true, commitment: 'confirmed'});

      spinner.succeed('Ebalts config created successfully!');

      // Display results
      console.log(chalk.green('✅ ABL list created successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('List Config:')} ${listConfig}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    }
    catch (error) {
      spinner.fail('Failed to create ebalts config');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      console.error(
        chalk.red('❌ Error:'),
        error
      );
      console.error(
        chalk.red('❌ Error:'),
        error instanceof SolanaError ? error : error instanceof Error ? error.message : 'Unknown error'
      );

      process.exit(1);
    }
  });