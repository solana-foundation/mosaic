import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { resolveSigner } from '../../utils/solana.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { printResult, readGlobalOpts, resolveFeePayer, resolveTokenAccount, withErrorHandling } from './common.js';

interface ApproveOptions {
    mint: string;
    tokenAccount?: string;
}

export const approveCommand = new Command('approve')
    .description('Approve a configured confidential account (for whitelist-policy mints)')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--token-account <address>', "Confidential token account to approve (defaults to the signer's ATA)")
    .showHelpAfterError()
    .action(async (options: ApproveOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Approving confidential account...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to approve confidential account', async () => {
            const { createApproveConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the mint's confidential-transfer authority.
            const { signer, address } = await resolveSigner(opts.rawTx, opts.keypairPath, opts.authority);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, address, options.tokenAccount);
            const feePayer = resolveFeePayer(opts, signer);

            const plan = createApproveConfidentialAccountInstructionPlan({ tokenAccount, mint, authority: signer });
            const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts.rawTx, spinner);
            if (raw) return;
            spinner.succeed('Confidential account approved!');
            printResult('Confidential Account Approved', mint, tokenAccount, signatures);
        });
    });
