import { Command } from 'commander';
import chalk from 'chalk';
import { getSetGatingProgramTransaction } from '@solana/mosaic-sdk';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { resolveSigners } from '../../utils/solana.js';
import { type Address, sendAndConfirmTransactionFactory } from '@solana/kit';
import { findMintConfigPda } from '@solana/token-acl-sdk';
import { TOKEN_ACL_PROGRAM_ID } from './util.js';
import { createSpinner, getGlobalOpts, sendOrOutputTransaction } from '../../utils/cli.js';

interface SetGatingProgramOptions {
    mint: string;
    gatingProgram: string;
}

export const setGatingProgram = new Command('set-gating-program')
    .description('Set the gating program for an existing mint')
    .requiredOption('-m, --mint <mint>', 'Mint address')
    .requiredOption('-g, --gating-program <gating-program>', 'Gating program address')
    .showHelpAfterError()
    .action(async (options: SetGatingProgramOptions, command) => {
        const parentOpts = getGlobalOpts(command);
        const rpcUrl = parentOpts.rpcUrl;
        const rawTx: string | undefined = parentOpts.rawTx;
        const spinner = createSpinner('Setting gating program...', rawTx);

        try {
            const rpc = createRpcClient(rpcUrl);
            const rpcSubscriptions = createRpcSubscriptions(rpcUrl);
            const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
            spinner.text = `Using RPC URL: ${rpcUrl}`;

            const { authority, feePayer: payer } = await resolveSigners(parentOpts);

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

            const { raw, signature } = await sendOrOutputTransaction(
                transaction,
                rawTx,
                spinner,
                sendAndConfirmTransaction,
            );
            if (raw) return;

            spinner.succeed('Gating program set successfully!');

            // Display results
            console.log(chalk.green('✅ Gating program set successfully!'));
            console.log(chalk.cyan('📋 Details:'));
            console.log(`   ${chalk.bold('Mint:')} ${options.mint}`);
            console.log(`   ${chalk.bold('Gating Program:')} ${options.gatingProgram}`);
            console.log(`   ${chalk.bold('Mint Config:')} ${mintConfigPda[0]}`);
            console.log(`   ${chalk.bold('Transaction:')} ${signature}`);
        } catch (error) {
            if (spinner && !rawTx) {
                spinner.fail('Failed to set gating program');
            }
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');

            process.exit(1);
        }
    });
