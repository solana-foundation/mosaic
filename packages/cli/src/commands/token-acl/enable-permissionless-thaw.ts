import { Command } from 'commander';
import chalk from 'chalk';
import { getEnablePermissionlessThawTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface EnablePermissionlessThawOptions {
    mint: string;
}

export const enablePermissionlessThaw = new Command('enable-permissionless-thaw')
    .description('Enable permissionless thaw for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .action(async (options: EnablePermissionlessThawOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Enabling permissionless thaw...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            // The SDK needs real signer objects here; the old raw branch cast bare addresses to them
            const { authority, feePayer: payer } = await resolveSigners(parentOpts);

            spinner.text = 'Building transaction...';

            const transaction = await getEnablePermissionlessThawTransaction({
                rpc,
                payer,
                authority,
                mint: options.mint as Address,
            });

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Permissionless thaw enabled successfully!');

            // Display results
            console.log(chalk.green('✅ Permissionless thaw enabled successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            spinner.fail('Failed to enable permissionless thaw');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
