import { Command } from 'commander';
import chalk from 'chalk';
import { getThawPermissionlessTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface ThawPermissionlessOptions {
    mint: string;
}

export const thawPermissionless = new Command('thaw-permissionless')
    .description('Thaw permissionless eoas for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .showHelpAfterError()
    .action(async (options: ThawPermissionlessOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Thawing permissionless...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            const { authority, feePayer: payer } = await resolveSigners(parentOpts);

            const signerAddress = authority.address;
            const mint = options.mint as Address;

            spinner.text = 'Building transaction...';

            const [ata] = await findAssociatedTokenPda({
                mint,
                owner: signerAddress,
                tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            });

            const transaction = await getThawPermissionlessTransaction({
                rpc,
                payer,
                authority,
                mint,
                tokenAccount: ata,
                tokenAccountOwner: signerAddress,
            });

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

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
