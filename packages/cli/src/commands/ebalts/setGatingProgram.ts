import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {  getSetGatingProgramTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
  signTransactionMessageWithSigners,
  SolanaError,
  type Address,
} from 'gill';
import { findMintConfigPda } from '@mosaic/ebalts';
import { EBALTS_PROGRAM_ID } from './util.js';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
  rpcUrl?: string;
  keypair?: string;
}

export const setGatingProgram = new Command('set-gating-program')
  .description('Set the gating program for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .requiredOption('-g, --gating-program <gating-program>', 'Gating program address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Setting gating program...').start();

    try {
      const parentOpts = command.parent?.parent?.opts() || {};
      const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
      const keypairPath = options.keypair || parentOpts.keypair;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      const mintConfigPda = await findMintConfigPda({ mint: options.mint as Address }, { programAddress: EBALTS_PROGRAM_ID });
      const gatingProgram = (options.gatingProgram || '11111111111111111111111111111111') as Address;
      
      const transaction = await getSetGatingProgramTransaction({
        rpc,
        payer: kp,
        authority: kp,
        mint: options.mint as Address,
        gatingProgram: gatingProgram,
      });

      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction, { skipPreflight: true, commitment: 'confirmed'});

      spinner.succeed('Gating program set successfully!');

      // Display results
      console.log(chalk.green('✅ Gating program set successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
      console.log(`   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`);
      console.log(`   ${chalk.bold('Mint Config:')} ${mintConfigPda[0]}`);
      console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
    }
    catch (error) {
      spinner.fail('Failed to set gating program');
      console.error(
        chalk.red('❌ Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      process.exit(1);
    }
  });