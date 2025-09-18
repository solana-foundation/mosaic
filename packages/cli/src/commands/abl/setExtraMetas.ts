import { Command } from 'commander';
import chalk from 'chalk';
import { getSetExtraMetasTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner } from 'gill';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface CreateConfigOptions {
  mint: string;
  list: string;
}

export const setExtraMetas = new Command('set-extra-metas')
  .description('Set extra metas for an existing list')
  .requiredOption('-m, --mint <mint>', 'Mint address')
  .requiredOption('-l, --list <list>', 'List address')
  .action(async (options: CreateConfigOptions, command) => {
    const parentOpts = getGlobalOpts(command as any);
    const rpcUrl = parentOpts.rpcUrl;
    const rawTx: string | undefined = parentOpts.rawTx;
    const spinner = createSpinner('Setting extra metas...', rawTx);

    try {
      const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
      
      let authority: TransactionSigner<string>;
      let feePayer: TransactionSigner<string>;
      if (rawTx) {
        const defaultAddr = (await getAddressFromKeypair(parentOpts.keypair)) as Address;
        authority = createNoopSigner(parentOpts.authority as Address || defaultAddr);
        feePayer = createNoopSigner(parentOpts.feePayer as Address || authority.address);
      } else {
        const kp = await loadKeypair(parentOpts.keypair);
        authority = kp;
        feePayer = kp;
      }

      const transaction = await getSetExtraMetasTransaction({
        rpc,
        payer: feePayer,
        authority,
        mint: options.mint as Address,
        list: options.list as Address,
      });

      const { raw, signature } = await sendOrOutputTransaction(
        transaction,
        rawTx,
        spinner,
        (tx) =>
          sendAndConfirmTransaction(tx, {
            skipPreflight: true,
            commitment: 'confirmed',
          })
      );
      if (raw) return;

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
