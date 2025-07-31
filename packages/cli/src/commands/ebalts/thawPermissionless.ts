import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createArcadeTokenInitTransaction, getThawPermissionlessTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { loadKeypair } from '../../utils/solana.js';
import {
    compressTransactionMessageUsingAddressLookupTables,
    createTransaction,
  generateKeyPairSigner,
  signTransactionMessageWithSigners,
  SolanaError,
  type Address,
  AccountRole,
  fetchEncodedAccount,
  lamports,
} from 'gill';
import { createThawPermissionlessInstructionWithExtraMetas, findMintConfigPda, getCreateConfigInstruction, getSetGatingProgramInstruction } from '@mosaic/ebalts';
import { EBALTS_PROGRAM_ID } from './util.js';
import { AccountState, getAssociatedTokenAccountAddress, getTokenEncoder, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { ABL_PROGRAM_ID } from '../abl/utils.js';
import { findABWalletPda } from '@mosaic/abl';

interface CreateConfigOptions {
  mint: string;
  rpcUrl?: string;
  keypair?: string;
}

export const thawPermissionless = new Command('thaw-permissionless')
  .description('Thaw permissionless eoas for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .action(async (options: CreateConfigOptions, command) => {
    const spinner = ora('Thawing permissionless...').start();

    try {
        const parentOpts = command.parent?.parent?.opts() || {};
        const rpcUrl = options.rpcUrl || parentOpts.rpcUrl;
        const keypairPath = options.keypair || parentOpts.keypair;
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      const kp = await loadKeypair(options.keypair);

      console.log(options);
      console.log(parentOpts);

      const signerAddress = kp.address;
      const mint = options.mint as Address;

      spinner.text = 'Building transaction...';

      const ata = await getAssociatedTokenAccountAddress(
        mint,
        signerAddress,
        TOKEN_2022_PROGRAM_ADDRESS
      );

      const transaction = await getThawPermissionlessTransaction({
        rpc,
        payer: kp,
        authority: kp,
        mint,
        tokenAccount: ata,
        tokenAccountOwner: signerAddress,
      });

      
      spinner.text = 'Signing transaction...';

      // Sign the transaction
      const signedTransaction =
        await signTransactionMessageWithSigners(transaction);

      spinner.text = 'Sending transaction...';

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(signedTransaction, { skipPreflight: true, commitment: 'confirmed'});

      spinner.succeed('Permissionless thawed successfully!');

      // Display results
      console.log(chalk.green('✅ Permissionless thawed successfully!'));
      console.log(chalk.cyan('📋 Details:'));
      console.log(`   ${chalk.bold('Token Account:')} ${ata}`);
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