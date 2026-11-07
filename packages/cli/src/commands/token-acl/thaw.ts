import { Command } from 'commander';
import chalk from 'chalk';
import { getThawTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface CreateConfigOptions {
    tokenAccount: string;
}

export const thaw = new Command('thaw')
    .description('Thaw a token account')
    .requiredOption('-t, --token-account <token-account>', 'Token account address')
    .showHelpAfterError()
    .action(async (options: CreateConfigOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Thawing token account...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            const { authority, feePayer: payer } = await resolveSigners(parentOpts);

            const transaction = await getThawTransaction({
                rpc,
                payer,
                authority,
                tokenAccount: options.tokenAccount as Address,
            });

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Thawing token account successfully!');

            // Display results
            console.log(chalk.green('✅ Thawing token account successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Token Account:')} ${options.tokenAccount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            if (!rawTx) {
                spinner.fail('Failed to thaw token account');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
