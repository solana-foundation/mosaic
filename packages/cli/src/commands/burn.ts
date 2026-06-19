import { Command } from 'commander';
import chalk from 'chalk';
import { createBurnTransaction, getPermissionedBurnAuthority } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner, sendAndConfirmTransactionFactory } from '@solana/kit';
import { getGlobalOpts, createSpinner, sendOrOutputTransaction } from '../utils/cli.js';

interface BurnOptions {
    mintAddress: string;
    amount: string;
    permissionedBurnKeypair?: string;
}

export const burnCommand = new Command('burn')
    .description('Burn tokens from the signer wallet')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-a, --amount <amount>', 'The decimal amount to burn (e.g., 1.5)')
    .option(
        '--permissioned-burn-keypair <path>',
        'Keypair for the permissioned burn authority (only needed when it differs from the signer on permissioned burn mints)',
    )
    .showHelpAfterError()
    .action(async (options: BurnOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Burning tokens...', rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

            let owner: TransactionSigner<string>;
            let payer: TransactionSigner<string>;
            if (rawTx) {
                const defaultAddr = (await getAddressFromKeypair(parentOpts.keypair)) as Address;
                owner = createNoopSigner((parentOpts.authority as Address) || defaultAddr);
                payer = createNoopSigner((parentOpts.feePayer as Address) || owner.address);
            } else {
                const kp = await loadKeypair(parentOpts.keypair);
                owner = kp;
                payer = kp;
            }

            // Parse and validate amount
            const decimalAmount = parseFloat(options.amount);
            if (isNaN(decimalAmount) || decimalAmount <= 0) {
                throw new Error('Amount must be a positive number');
            }

            spinner.text = 'Building burn transaction...';

            // On permissioned burn mints the configured burn authority must co-sign.
            // Default to the signer when it matches the configured authority.
            let permissionedBurnAuthority: TransactionSigner<string> | undefined;
            if (options.permissionedBurnKeypair) {
                permissionedBurnAuthority = await loadKeypair(options.permissionedBurnKeypair);
                if (!rawTx) {
                    // A keypair that doesn't match the mint's configured authority would
                    // only fail at send time with a generic signature error, so reject it
                    // up front. Raw mode is exempt since signers can be swapped externally.
                    const configuredBurnAuthority = await getPermissionedBurnAuthority(
                        rpc,
                        options.mintAddress as Address,
                    );
                    if (configuredBurnAuthority && configuredBurnAuthority !== permissionedBurnAuthority.address) {
                        throw new Error(
                            `Mint has permissioned burn enabled with authority ${configuredBurnAuthority}, which differs from the provided --permissioned-burn-keypair (${permissionedBurnAuthority.address}).`,
                        );
                    }
                }
            } else {
                const configuredBurnAuthority = await getPermissionedBurnAuthority(rpc, options.mintAddress as Address);
                if (configuredBurnAuthority === owner.address) {
                    permissionedBurnAuthority = owner;
                } else if (configuredBurnAuthority && !rawTx) {
                    // Without the co-signer the transaction would only fail at send time
                    // with a generic signature verification error. Raw mode is exempt
                    // since the co-signature can be added externally.
                    throw new Error(
                        `Mint has permissioned burn enabled with authority ${configuredBurnAuthority}, which differs from the signer. Pass --permissioned-burn-keypair to co-sign the burn.`,
                    );
                }
            }

            const transaction = await createBurnTransaction(
                rpc,
                options.mintAddress as Address,
                owner,
                decimalAmount,
                payer,
                permissionedBurnAuthority,
            );

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Tokens burned successfully!');

            // Display results
            console.log(chalk.green('✅ Burn Transaction Successful'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('Owner:')} ${owner.address}`);
            console.log(`   ${chalk.bold('Amount Burned:')} ${decimalAmount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            if (permissionedBurnAuthority) {
                console.log(`   ${chalk.bold('Permissioned Burn Authority:')} ${permissionedBurnAuthority.address}`);
            }

            console.log(chalk.cyan('🔥 Result:'));
            console.log(`   ${chalk.green('✓')} Tokens permanently burned from the owner account`);
            console.log(`   ${chalk.yellow('⚠️')}  This action is irreversible - tokens are permanently destroyed`);
        } catch (error) {
            spinner.fail('Failed to burn tokens');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');

            // Provide helpful error context for common issues
            if (error instanceof Error) {
                if (error.message.includes('Insufficient token balance')) {
                    console.error(chalk.yellow('\n💡 Tip:'), 'The owner account may not have enough tokens to burn.');
                } else if (error.message.includes('does not exist')) {
                    console.error(chalk.yellow('\n💡 Tip:'), 'The owner may not have a token account for this mint.');
                }
            }

            process.exit(1);
        }
    });
