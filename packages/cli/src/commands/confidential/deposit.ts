import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { resolveSigner } from '../../utils/solana.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { printResult, readGlobalOpts, resolveFeePayer, resolveTokenAccount, withErrorHandling } from './common.js';

interface DepositOptions {
    mint: string;
    amount: string;
    tokenAccount?: string;
}

export const depositCommand = new Command('deposit')
    .description('Deposit from the plaintext balance into the pending confidential balance')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .requiredOption('--amount <decimal>', 'Amount to deposit (decimal, e.g. 1.5)')
    .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
    .showHelpAfterError()
    .action(async (options: DepositOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing deposit...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to deposit', async () => {
            const { createConfidentialDepositInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const { signer, address } = await resolveSigner(opts.rawTx, opts.keypairPath, opts.authority);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, address, options.tokenAccount);
            const feePayer = resolveFeePayer(opts, signer);

            const plan = await createConfidentialDepositInstructionPlan({
                rpc,
                mint,
                tokenAccount,
                authority: signer,
                amount: options.amount,
            });
            const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts.rawTx, spinner);
            if (raw) return;
            spinner.succeed('Deposit complete!');
            printResult('Confidential Deposit Complete', mint, tokenAccount, signatures);
        });
    });
