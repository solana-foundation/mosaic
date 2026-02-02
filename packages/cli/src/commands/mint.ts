import { Command } from 'commander';
import chalk from 'chalk';
import { createMintToTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../utils/solana.js';
import { createNoopSigner, type Address, type TransactionSigner, sendAndConfirmTransactionFactory } from '@solana/kit';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../utils/cli.js';

interface MintOptions {
    mintAddress: string;
    recipient: string;
    amount: string;
}

export const mintCommand = new Command('mint')
    .description('Mint tokens to a recipient address')
    .requiredOption('-m, --mint-address <mint-address>', 'The mint address of the token')
    .requiredOption('-r, --recipient <recipient>', 'The recipient wallet address (ATA owner)')
    .requiredOption('-a, --amount <amount>', 'The decimal amount to mint (e.g., 1.5)')
    .showHelpAfterError()
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: cmd => cmd.name(),
    })
    .action(async (options: MintOptions, command) => {
        // Get global options from parent command
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const keypairPath = parentOpts.keypair;
        const rawTx: string | undefined = parentOpts.rawTx;

        const spinner = createSpinner('Minting tokens...', rawTx);

        try {
            // Create RPC client
            const rpc = createRpcClient(rpcUrl);

            // Resolve authorities: support address-based for raw mode
            let mintAuthority: TransactionSigner<string>;
            let feePayer: TransactionSigner<string>;
            let signerKp: TransactionSigner<string>;
            if (rawTx) {
                mintAuthority = createNoopSigner(
                    (parentOpts.authority as Address) || (await getAddressFromKeypair(keypairPath)),
                );
                feePayer = createNoopSigner((parentOpts.feePayer as Address) || mintAuthority.address);
            } else {
                signerKp = await loadKeypair(keypairPath);
                mintAuthority = signerKp;
                feePayer = signerKp;
            }

            spinner.text = 'Getting mint information...';

            // Parse and validate amount
            const decimalAmount = parseFloat(options.amount);
            if (isNaN(decimalAmount) || decimalAmount <= 0) {
                throw new Error('Amount must be a positive number');
            }

            // Convert decimal amount to raw amount

            spinner.text = 'Building mint transaction...';

            // Create mint transaction (accepts Address or signer)
            const transaction = await createMintToTransaction(
                rpc,
                options.mintAddress as Address,
                options.recipient as Address,
                decimalAmount,
                mintAuthority,
                feePayer,
            );

            // If raw requested, output and exit
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Tokens minted successfully!');

            // Display results
            console.log(chalk.green('✅ Mint Transaction Successful'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint Address:')} ${options.mintAddress}`);
            console.log(`   ${chalk.bold('Recipient:')} ${options.recipient}`);
            console.log(`   ${chalk.bold('Amount:')} ${decimalAmount}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
            console.log(`   ${chalk.bold('Mint Authority:')} ${mintAuthority}`);

            console.log(chalk.cyan('\\n🎯 Result:'));
            console.log(`   ${chalk.green('✓')} Associated Token Account created/updated`);
            console.log(`   ${chalk.green('✓')} ${decimalAmount} tokens minted to recipient`);
        } catch (error) {
            spinner.fail('Failed to mint tokens');
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error : 'Unknown error');
            process.exit(1);
        }
    });
