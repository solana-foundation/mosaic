import { Command } from 'commander';
import chalk from 'chalk';
import {
    type Address,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    sendAndConfirmTransactionFactory,
} from '@solana/kit';
import { createTransferInstructions } from '@solana/mosaic-sdk';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../utils/cli.js';
import { createRpcClient, createRpcSubscriptions } from '../utils/rpc.js';
import { resolveSigners } from '../utils/solana.js';

interface TransferOptions {
    mintAddress: string;
    recipient: string;
    amount: string;
    memo?: string;
    sender?: string;
}

export const transferCommand = new Command('transfer')
    .description('Transfer tokens to a recipient (creates ATA if needed)')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-r, --recipient <recipient>', 'The recipient wallet address')
    .requiredOption('-a, --amount <amount>', 'The decimal amount to transfer (e.g., 1.5)')
    .option('-n, --memo <memo>', 'The memo to include in the transaction')
    .option('-s, --sender <sender>', 'The sender wallet address (defaults to keypair)')
    .showHelpAfterError()
    .action(async (options: TransferOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Transferring tokens...', rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            const { authority, feePayer } = await resolveSigners(parentOpts);
            // --sender only applies to --raw-tx; otherwise the --keypair signer sends
            const senderAddress = rawTx ? (options.sender as Address) || authority.address : authority.address;

            spinner.text = 'Building transfer transaction...';
            const instructions = await createTransferInstructions({
                rpc,
                mint: options.mintAddress as Address,
                from: senderAddress,
                to: options.recipient as Address,
                feePayer,
                authority,
                amount: options.amount,
                memo: options.memo,
            });

            // Get latest blockhash for transaction
            const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

            // Create transaction
            const transaction = pipe(
                createTransactionMessage({ version: 0 }),
                // As a signer, not an address, so the --keypair fee payer actually signs
                m => setTransactionMessageFeePayerSigner(feePayer, m),
                m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
                m => appendTransactionMessageInstructions(instructions, m),
            );

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Transfer completed successfully!');

            // Display results
            console.log(chalk.green('✅ Transfer Transaction Successful'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('From Account:')} ${senderAddress}`);
            console.log(`   ${chalk.bold('To Account:')} ${options.recipient}`);
            console.log(`   ${chalk.bold('Recipient:')} ${options.recipient}`);
            console.log(`   ${chalk.bold('Amount:')} ${options.amount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);

            console.log(chalk.cyan('⚡ Result:'));
            console.log(`   ${chalk.green('✓')} Tokens transferred successfully`);
        } catch (error) {
            spinner.fail('Failed to transfer tokens');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');

            // Provide helpful error context for common issues
            if (error instanceof Error) {
                if (error.message.includes('insufficient funds')) {
                    console.error(
                        chalk.yellow('💡 Tip:'),
                        'You may not have enough tokens to transfer, or insufficient SOL for transaction fees.',
                    );
                } else if (error.message.includes('Account does not exist')) {
                    console.error(
                        chalk.yellow('💡 Tip:'),
                        'Your token account may not exist. You need to have tokens first before you can transfer them.',
                    );
                }
            }

            process.exit(1);
        }
    });
