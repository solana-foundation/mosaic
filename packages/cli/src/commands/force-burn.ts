import { Command } from 'commander';
import chalk from 'chalk';
import { createForceBurnTransaction, validatePermanentDelegateForBurn } from '@mosaic/sdk';
import { createSolanaClient } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner } from 'gill';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../utils/cli.js';

interface ForceBurnOptions {
    mintAddress: string;
    fromAccount: string;
    amount: string;
}

export const forceBurnCommand = new Command('force-burn')
    .description('Force burn tokens using permanent delegate authority')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption(
        '-f, --from-account <from-account>',
        'The account to burn tokens from (wallet address or ATA address)',
    )
    .requiredOption('-a, --amount <amount>', 'The decimal amount to burn (e.g., 1.5)')
    .showHelpAfterError()
    .action(async (options: ForceBurnOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Force burning tokens...', parentOpts.rawTx);

        try {
            // Create Solana client
            const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);

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
            await validatePermanentDelegateForBurn(rpc, options.mintAddress as Address, authority.address);

            spinner.text = 'Building force burn transaction...';

            // Create force burn transaction
            const transaction = await createForceBurnTransaction(
                rpc,
                options.mintAddress as Address,
                options.fromAccount as Address,
                decimalAmount,
                authority.address,
                payer.address,
            );

            const { raw, signature } = await sendOrOutputTransaction(transaction, rawTx, spinner, tx =>
                sendAndConfirmTransaction(tx, {
                    skipPreflight: true,
                    commitment: 'confirmed',
                }),
            );
            if (raw) return;

            spinner.succeed('Force burn completed successfully!');

            // Display results
            console.log(chalk.green('✅ Force Burn Transaction Successful'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('From Account:')} ${options.fromAccount}`);
            console.log(`   ${chalk.bold('Amount Burned:')} ${decimalAmount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Permanent Delegate:')} ${authority.address}`);

            console.log(chalk.cyan('🔥 Result:'));
            console.log(`   ${chalk.green('✓')} Tokens permanently burned from the account`);
            console.log(`   ${chalk.green('✓')} Burn completed using permanent delegate authority`);
            console.log(`   ${chalk.yellow('⚠️')}  This action is irreversible - tokens are permanently destroyed`);
            console.log(`   ${chalk.yellow('⚠️')}  This action bypassed normal token account permissions`);
        } catch (error) {
            spinner.fail('Failed to force burn tokens');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');

            // Provide helpful error context for common issues
            if (error instanceof Error) {
                if (error.message.includes('permanent delegate extension')) {
                    console.error(
                        chalk.yellow('\n💡 Tip:'),
                        'This mint may not have the permanent delegate extension enabled, or you may not be the designated permanent delegate.',
                    );
                } else if (error.message.includes('insufficient funds')) {
                    console.error(chalk.yellow('\n💡 Tip:'), 'The source account may not have enough tokens to burn.');
                } else if (error.message.includes('does not exist')) {
                    console.error(
                        chalk.yellow('\n💡 Tip:'),
                        'The specified account may not exist or may not be a valid token account for this mint.',
                    );
                }
            }

            process.exit(1);
        }
    });
