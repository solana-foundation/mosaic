import { Command } from 'commander';
import chalk from 'chalk';
import { getCreateConfigTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface CreateConfigOptions {
    mint: string;
    gatingProgram: string;
}

export const createConfig = new Command('create')
    .description('Create a new Token ACL config for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .option('-g, --gating-program <gating-program>', 'Gating program address')
    .showHelpAfterError()
    .action(async (options: CreateConfigOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Creating Token ACL config...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            const { authority, feePayer: payer } = await resolveSigners(parentOpts);

            const gatingProgram = (options.gatingProgram || '11111111111111111111111111111111') as Address;

            const { transaction, mintConfig } = await getCreateConfigTransaction({
                rpc,
                payer,
                authority,
                mint: options.mint as Address,
                gatingProgram,
            });

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Token ACL config created successfully!');

            // Display results
            console.log(chalk.green('✅ Token ACL config created successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
            console.log(`   ${chalk.bold('Gating Program:')} ${gatingProgram}`);
            console.log(`   ${chalk.bold('Mint Config:')} ${mintConfig}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            spinner.fail('Failed to create Token ACL config');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
