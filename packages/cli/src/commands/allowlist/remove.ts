import { Command } from 'commander';
import chalk from 'chalk';
import { createRemoveFromAllowlistTransaction } from '@mosaic/sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface RemoveOptions {
    mintAddress: string;
    account: string;
}

export const removeCommand = new Command('remove')
    .description('Remove an account from the allowlist')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-a, --account <account>', 'The account to remove from the allowlist (wallet address)')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: RemoveOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;

        const spinner = createSpinner('Removing account from allowlist...', rawTx);

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

            spinner.text = 'Building remove transaction...';

            // Create remove transaction
            const transaction = await createRemoveFromAllowlistTransaction(
                rpc,
                options.mintAddress as Address,
                options.account as Address,
                authoritySigner,
            );

            const { raw, signature } = await sendOrOutputTransaction(transaction, rawTx, spinner, sendAndConfirmTransaction);
            if (raw) return;

            spinner.succeed('Account removed from allowlist successfully!');

            // Display results
            console.log(chalk.green('✅ Removed account from allowlist'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('Input Account:')} ${options.account}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Authority:')} ${authorityAddress}`);
        } catch (error) {
            spinner.fail('Failed to remove account from allowlist');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');
            process.exit(1);
        }
    });
