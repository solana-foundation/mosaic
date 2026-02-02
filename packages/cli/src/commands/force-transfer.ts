import { Command } from 'commander';
import chalk from 'chalk';
import { createForceTransferTransaction, validatePermanentDelegate } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../utils/cli.js';

interface ForceTransferOptions {
    mintAddress: string;
    fromAccount: string;
    recipient: string;
    amount: string;
}

export const forceTransferCommand = new Command('force-transfer')
    .description('Force transfer tokens using permanent delegate authority')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-f, --from-account <from-account>', 'The source account (wallet address or ATA address)')
    .requiredOption('-r, --recipient <recipient>', 'The recipient account (wallet address or ATA address)')
    .requiredOption('-a, --amount <amount>', 'The decimal amount to transfer (e.g., 1.5)')
    .showHelpAfterError()
    .action(async (options: ForceTransferOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Force transferring tokens...', parentOpts.rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            let authority: TransactionSigner<string>;
            let payer: TransactionSigner<string>;
            if (rawTx) {
                const defaultAddr = (await getAddressFromKeypair(parentOpts.keypair)) as Address;
                authority = createNoopSigner((parentOpts.authority as Address) || defaultAddr);
                payer = createNoopSigner((parentOpts.feePayer as Address) || authority.address);
            } else {
                const kp = await loadKeypair(parentOpts.keypair);
                authority = kp;
                payer = kp;
            }

            // Parse and validate amount
            const decimalAmount = parseFloat(options.amount);
            if (isNaN(decimalAmount) || decimalAmount <= 0) {
                throw new Error('Amount must be a positive number');
            }

            spinner.text = 'Validating permanent delegate authority...';

            // Validate that the mint has permanent delegate extension and our keypair is the delegate
            await validatePermanentDelegate(rpc, options.mintAddress as Address, authority.address);

            spinner.text = 'Building force transfer transaction...';

            // Create force transfer transaction
            const transaction = await createForceTransferTransaction(
                rpc,
                options.mintAddress as Address,
                options.fromAccount as Address,
                options.recipient as Address,
                decimalAmount,
                authority.address,
                payer.address,
            );

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Force transfer completed successfully!');

            // Display results
            console.log(chalk.green('✅ Force Transfer Transaction Successful'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('From Account:')} ${options.fromAccount}`);
            console.log(`   ${chalk.bold('To Account:')} ${options.recipient}`);
            console.log(`   ${chalk.bold('Amount:')} ${decimalAmount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Permanent Delegate:')} ${authority.address}`);

            console.log(chalk.cyan('⚡ Result:'));
            console.log(`   ${chalk.green('✓')} Tokens force transferred using permanent delegate authority`);
            console.log(`   ${chalk.green('✓')} Transfer completed without requiring approval from source account`);
            console.log(`   ${chalk.yellow('⚠️')}  This action bypassed normal token account permissions`);
        } catch (error) {
            spinner.fail('Failed to force transfer tokens');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');

            // Provide helpful error context for common issues
            if (error instanceof Error) {
                if (error.message.includes('permanent delegate extension')) {
                    console.error(
                        chalk.yellow('\\n💡 Tip:'),
                        'This mint may not have the permanent delegate extension enabled, or you may not be the designated permanent delegate.',
                    );
                } else if (error.message.includes('insufficient funds')) {
                    console.error(
                        chalk.yellow('\\n💡 Tip:'),
                        'The source account may not have enough tokens to transfer.',
                    );
                }
            }

            process.exit(1);
        }
    });
