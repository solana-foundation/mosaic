import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { resolveSigners } from '../../utils/solana.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface ApproveOptions {
    mint: string;
    tokenAccount?: string;
    owner?: string;
}

export const approveCommand = new Command('approve')
    .description('Approve a configured confidential account (for whitelist-policy mints)')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--owner <address>', 'Owner of the account to approve (its ATA for the mint is used)')
    .option('--token-account <address>', 'Confidential token account to approve (overrides --owner)')
    .showHelpAfterError()
    .action(async (options: ApproveOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Approving confidential account...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to approve confidential account', async () => {
            const { createApproveConfidentialAccountInstructionPlan } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            if (!options.owner && !options.tokenAccount) {
                throw new Error('Pass --owner or --token-account to name the account to approve.');
            }
            // The signer here is the mint's confidential-transfer authority.
            const { authority: signer, feePayer } = await resolveSigners(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, options.owner as Address, options.tokenAccount);

            const plan = createApproveConfidentialAccountInstructionPlan({ tokenAccount, mint, authority: signer });
            const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts, spinner);
            if (raw) return;
            spinner.succeed('Confidential account approved!');
            printResult('Confidential Account Approved', mint, tokenAccount, signatures);
        });
    });
