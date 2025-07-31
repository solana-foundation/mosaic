import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createArcadeTokenInitTransaction, getCreateConfigTransaction } from '@mosaic/sdk';
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
import { findMintConfigPda, getCreateConfigInstruction } from '@mosaic/ebalts';
import { EBALTS_PROGRAM_ID } from './util.js';

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
  //.option('-p, --payer <payer>', 'Payer address')
  //.option('-a, --authority <authority>', 'Authority address')
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

      const gatingProgram = (options.gatingProgram || '11111111111111111111111111111111') as Address;

      const {transaction, mintConfig} = await getCreateConfigTransaction({
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
      const signature = await sendAndConfirmTransaction(signedTransaction, { skipPreflight: true, commitment: 'confirmed'});

      spinner.succeed('Ebalts config created successfully!');

      // Display results
      console.log(chalk.green('✅ Ebalts config created successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
      console.log(`   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`);
      console.log(`   ${chalk.bold('Mint Config:')} ${mintConfig}`);
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