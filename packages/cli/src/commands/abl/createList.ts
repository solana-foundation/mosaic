import { Command } from 'commander';
import chalk from 'chalk';
import { getCreateListTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner } from 'gill';
import {
  getGlobalOpts,
  createSpinner,
  sendOrOutputTransaction,
} from '../../utils/cli.js';

interface CreateConfigOptions {
  mint: string;
  gatingProgram: string;
}

export const createList = new Command('create-list')
  .description('Create a new list for an existing mint')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .requiredOption(
    '-g, --gating-program <gating-program>',
    'Gating program address'
  )
  .showHelpAfterError()
  .action(async (options: CreateConfigOptions, command) => {
    const parentOpts = getGlobalOpts(command);
    const rpcUrl = parentOpts.rpcUrl;
    const rawTx: string | undefined = parentOpts.rawTx;
    const spinner = createSpinner('Creating Token ACL config...', rawTx);

    try {
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

      let authority: TransactionSigner<string>;
      let payer: TransactionSigner<string>;
      if (rawTx) {
        const defaultAddr = (await getAddressFromKeypair(
          parentOpts.keypair
        )) as Address;
        authority = createNoopSigner(
          (parentOpts.authority as Address) || defaultAddr
        );
        payer = createNoopSigner(
          (parentOpts.feePayer as Address) || authority.address
        );
      } else {
        const kp = await loadKeypair(parentOpts.keypair);
        authority = kp;
        payer = kp;
      }

      const { transaction, listConfig } = await getCreateListTransaction({
        rpc,
        payer: payer,
        authority: authority,
        mint: options.mint as Address,
      });

      const { raw, signature } = await sendOrOutputTransaction(
        transaction,
        rawTx,
        spinner,
        tx =>
          sendAndConfirmTransaction(tx, {
            skipPreflight: true,
            commitment: 'confirmed',
          })
      );
      if (raw) return;

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
