import { Command } from 'commander';
import chalk from 'chalk';
import { createAddToAllowlistTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { type Address } from 'gill';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface AddOptions {
    mintAddress: string;
    account: string;
}

export const addCommand = new Command('add')
    .description('Add an account to the allowlist')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-a, --account <account>', 'The account to add to the allowlist (wallet address)')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: AddOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Adding account to allowlist...', rawTx);

        try {
            // Get global options from parent command
            const keypairPath = parentOpts.keypair;

            // Create Solana client
            const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            // Resolve authority signer or address
            const { signer: authoritySigner, address: authorityAddress } = await resolveSigner(
                rawTx,
                keypairPath,
                parentOpts.authority,
            );

            spinner.text = 'Building add transaction...';

            // Create add transaction
            const transaction = await createAddToAllowlistTransaction(
                rpc,
                options.mintAddress as Address,
                options.account as Address,
                authoritySigner,
            );

            const { raw, signature } = await sendOrOutputTransaction(transaction, rawTx, spinner, tx =>
                sendAndConfirmTransaction(tx),
            );
            if (raw) return;

            spinner.succeed('Account added to allowlist successfully!');

            // Display results
            console.log(chalk.green('✅ Added account to allowlist'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Authority:')} ${authorityAddress}`);
        } catch (error) {
            if (!rawTx) {
                spinner.fail('Failed to add account to allowlist');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');
            process.exit(1);
        }
    });
