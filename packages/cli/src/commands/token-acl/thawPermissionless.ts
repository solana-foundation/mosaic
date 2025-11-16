import { Command } from 'commander';
import chalk from 'chalk';
import { getThawPermissionlessTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { maybeOutputRawTx } from '../../utils/rawTx.js';
import { createNoopSigner, signTransactionMessageWithSigners, type Address, type TransactionSigner } from 'gill';
import { getAssociatedTokenAccountAddress, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface CreateConfigOptions {
    mint: string;
}

export const thawPermissionless = new Command('thaw-permissionless')
    .description('Thaw permissionless eoas for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .showHelpAfterError()
    .action(async (options: CreateConfigOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Thawing permissionless...', rawTx);

        try {
            const { rpc, sendAndConfirmTransaction } = createSolanaClient(rpcUrl);
            spinner.text = `Using RPC URL: ${rpcUrl}`;

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

            const signerAddress = rawTx
                ? ((parentOpts.authority || authority.address) as Address)
                : (authority.address as Address);
            const mint = options.mint as Address;

            spinner.text = 'Building transaction...';

            const ata = await getAssociatedTokenAccountAddress(mint, signerAddress, TOKEN_2022_PROGRAM_ADDRESS);

            const transaction = await getThawPermissionlessTransaction({
                rpc,
                payer,
                authority,
                mint,
                tokenAccount: ata,
                tokenAccountOwner: signerAddress,
            });

            if (maybeOutputRawTx(rawTx, transaction)) {
                return;
            }

            spinner.text = 'Signing transaction...';

            // Sign the transaction
            const signedTransaction = await signTransactionMessageWithSigners(transaction);

            spinner.text = 'Sending transaction...';

            // Send and confirm transaction
            const signature = await sendAndConfirmTransaction(signedTransaction, {
                skipPreflight: true,
                commitment: 'confirmed',
            });

            spinner.succeed('Permissionless thawed successfully!');

            // Display results
            console.log(chalk.green('✅ Permissionless thawed successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Token Account:')} ${ata}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            if (!rawTx) {
                spinner.fail('Failed to thaw permissionless');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
