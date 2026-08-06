import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface ConfigureAccountOptions {
    mint: string;
    tokenAccount?: string;
    maxPendingCredits?: string;
}

export const configureAccountCommand = new Command('configure-account')
    .description('Configure a token account for confidential transfers (creates/reallocates the ATA)')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--token-account <address>', "Token account to configure (defaults to the signer's ATA)")
    .option('--max-pending-credits <number>', 'Max pending credits before apply-pending-balance is required')
    .showHelpAfterError()
    .action(async (options: ConfigureAccountOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Configuring confidential account...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to configure confidential account', async () => {
            const {
                createConfigureConfidentialAccountInstructionPlan,
                deriveConfidentialKeysForOwnerMint,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, signer.address, options.tokenAccount);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createConfigureConfidentialAccountInstructionPlan({
                    rpc,
                    payer: signer,
                    owner: signer,
                    mint,
                    keys,
                    token: options.tokenAccount as Address | undefined,
                    maximumPendingBalanceCreditCounter: options.maxPendingCredits
                        ? BigInt(options.maxPendingCredits)
                        : undefined,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential account configured!');
                printResult('Confidential Account Configured', mint, tokenAccount, signatures);
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
