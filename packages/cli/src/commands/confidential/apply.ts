import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface ApplyOptions {
    mint: string;
    tokenAccount?: string;
}

export const applyCommand = new Command('apply')
    .description('Apply the pending confidential balance into the available confidential balance')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
    .showHelpAfterError()
    .action(async (options: ApplyOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Applying pending balance...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to apply pending balance', async () => {
            const {
                createApplyConfidentialPendingBalanceInstructionPlan,
                deriveConfidentialKeysForOwnerMint,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, signer.address, options.tokenAccount);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createApplyConfidentialPendingBalanceInstructionPlan({
                    rpc,
                    tokenAccount,
                    authority: signer,
                    keys,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Pending balance applied!');
                printResult('Pending Balance Applied', mint, tokenAccount, signatures);
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
