import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface EmptyAccountOptions {
    mint: string;
    tokenAccount?: string;
}

export const emptyAccountCommand = new Command('empty-account')
    .description('Prove the available confidential balance is zero so the account can be closed')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
    .showHelpAfterError()
    .action(async (options: EmptyAccountOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Emptying confidential account...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to empty confidential account', async () => {
            const {
                createEmptyConfidentialAccountInstructionPlan,
                deriveConfidentialKeysForOwnerMint,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, signer.address, options.tokenAccount);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createEmptyConfidentialAccountInstructionPlan({
                    rpc,
                    payer: signer,
                    tokenAccount,
                    authority: signer,
                    keys,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential account emptied!');
                printResult('Confidential Account Emptied', mint, tokenAccount, signatures);
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
