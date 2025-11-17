import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getSetGatingProgramTransaction } from '@mosaic/sdk';
import { createSolanaClient } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';
import { createNoopSigner, signTransactionMessageWithSigners, type Address, type TransactionSigner } from 'gill';
import { maybeOutputRawTx } from '../../utils/raw-tx.js';
import { findMintConfigPda } from '@token-acl/sdk';
import { TOKEN_ACL_PROGRAM_ID } from './util.js';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';

interface CreateConfigOptions {
    mint: string;
    gatingProgram: string;
}

export const setGatingProgram = new Command('set-gating-program')
    .description('Set the gating program for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .requiredOption('-g, --gating-program <gating-program>', 'Gating program address')
    .showHelpAfterError()
    .action(async (options: CreateConfigOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Setting gating program...', rawTx);

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

            const mintConfigPda = await findMintConfigPda(
                { mint: options.mint as Address },
                { programAddress: TOKEN_ACL_PROGRAM_ID },
            );
            const gatingProgram = (options.gatingProgram || '11111111111111111111111111111111') as Address;

            const transaction = await getSetGatingProgramTransaction({
                rpc,
                payer,
                authority,
                mint: options.mint as Address,
                gatingProgram: gatingProgram,
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

            spinner.succeed('Gating program set successfully!');

            // Display results
            console.log(chalk.green('✅ Gating program set successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
            console.log(`   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`);
            console.log(`   ${chalk.bold('Mint Config:')} ${mintConfigPda[0]}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            const parentOpts = command.parent?.parent?.opts() || {};
            const rawTx: string | undefined = parentOpts.rawTx;
            if (!rawTx) {
                const spinner = ora({
                    text: 'Setting gating program...',
                    isSilent: false,
                }).start();
                spinner.fail('Failed to set gating program');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
