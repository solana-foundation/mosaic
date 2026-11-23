import { Command } from 'commander';
import chalk from 'chalk';
import { getSetExtraMetasTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface SetExtraMetasOptions {
    mint: string;
    list: string;
}

export const setExtraMetas = new Command('set-extra-metas')
    .description('Set extra metas for an existing list')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .requiredOption('-l, --list <list>', 'List address')
    .action(async (options: SetExtraMetasOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Setting extra metas...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            const { authority, feePayer } = await resolveSigners(parentOpts);

            const transaction = await getSetExtraMetasTransaction({
                rpc,
                payer: feePayer,
                authority,
                mint: options.mint as Address,
                addresses: [options.list] as Address[],
            });

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Extra metas set successfully!');

            // Display results
            console.log(chalk.green('✅ Extra metas set successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            spinner.fail('Failed to set extra metas');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
