import { Command } from 'commander';
import chalk from 'chalk';
import { getTokenPauseState, createResumeTransaction, MINT_NOT_PAUSED_ERROR } from '@mosaic/sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigner } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../../utils/cli.js';

interface ResumeOptions {
    mintAddress: string;
}

export const resumeCommand = new Command('resume')
    .description('Resume token transfers (unpause)')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token to resume')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: ResumeOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;

        const spinner = createSpinner('Checking token state...', rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            // Check current pause state
            spinner.text = 'Checking current pause state...';
            const currentlyPaused = await getTokenPauseState(rpc, options.mintAddress as Address);

            if (!currentlyPaused) {
                spinner.warn('Token is not paused');
                console.log(chalk.yellow('⚠️  Token is not currently paused. No action needed.'));
                process.exit(0);
            }

            spinner.text = 'Preparing resume transaction...';

            // Resolve pause authority signer or address
            const { signer: pauseAuthority, address: pauseAuthorityAddress } = await resolveSigner(
                rawTx,
                keypairPath,
                parentOpts.authority,
            );

            spinner.text = 'Sending resume transaction...';

            // Execute unpause transaction (resume)
            const { transactionMessage } = await createResumeTransaction(rpc, {
                mint: options.mintAddress as Address,
                pauseAuthority,
                feePayer: pauseAuthority, // Use same signer for fee payer
            });

            const { raw, signature } = await sendOrOutputTransaction(transactionMessage, rawTx, spinner, sendAndConfirmTransaction);
            if (raw) return;

            spinner.succeed('Token resumed successfully!');

            // Display results
            console.log(chalk.green('\\n✅ Token Resumed Successfully'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            if (signature) {
                console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            }
            console.log(`   ${chalk.bold('Pause Authority:')} ${pauseAuthorityAddress}`);
            console.log(`   ${chalk.bold('Status:')} Token transfers are now enabled`);

            console.log(chalk.cyan('\\n🎯 Result:'));
            console.log(`   ${chalk.green('✓')} Token is now active`);
            console.log(`   ${chalk.green('✓')} All transfers can proceed normally`);
            console.log(`   ${chalk.green('✓')} DeFi protocols can interact with the token`);
        } catch (error) {
            if (error instanceof Error && error.message === MINT_NOT_PAUSED_ERROR) {
                spinner.warn('Token is not currently paused');
                console.log(
                    chalk.yellow(
                        '⚠️  Token is not currently paused. Use "mosaic control pause" command to pause the token.',
                    ),
                );
                process.exit(0);
            }

            spinner.fail('Failed to resume token');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
