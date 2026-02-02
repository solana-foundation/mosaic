import { Command } from 'commander';
import chalk from 'chalk';
import { createAddToBlocklistTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface AddOptions {
    mintAddress: string;
    account: string;
}

export const addCommand = new Command('add')
    .description('Add an account to the blocklist')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-a, --account <account>', 'The account to freeze (wallet address)')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: AddOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;

        const spinner = createSpinner('Adding account to blocklist...', rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            // Resolve authority signer or address
            const { signer: authoritySigner, address: authorityAddress } = await resolveSigner(
                rawTx,
                keypairPath,
                parentOpts.authority,
            );

            spinner.text = 'Building add transaction...';

            // Create add transaction
            const transaction = await createAddToBlocklistTransaction(
                rpc,
                options.mintAddress as Address,
                options.account as Address,
                authoritySigner,
            );

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Account added to blocklist successfully!');

            // Display results
            console.log(chalk.green('✅ Added account to blocklist'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Authority:')} ${authorityAddress}`);
        } catch (error) {
            spinner.fail('Failed to add account to blocklist');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');
            process.exit(1);
        }
    });
