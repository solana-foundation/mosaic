import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface WithdrawOptions {
    mint: string;
    amount: string;
    tokenAccount?: string;
}

export const withdrawCommand = new Command('withdraw')
    .description('Withdraw from the available confidential balance back to the plaintext balance')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .requiredOption('--amount <decimal>', 'Amount to withdraw (decimal, e.g. 1.5)')
    .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
    .showHelpAfterError()
    .action(async (options: WithdrawOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential withdrawal...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to withdraw confidential balance', async () => {
            const {
                createConfidentialWithdrawInstructionPlan,
                deriveConfidentialKeysForOwnerMint,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, signer.address, options.tokenAccount);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createConfidentialWithdrawInstructionPlan({
                    rpc,
                    payer: signer,
                    mint,
                    tokenAccount,
                    authority: signer,
                    amount: options.amount,
                    keys,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential withdrawal complete!');
                printResult('Confidential Withdrawal Complete', mint, tokenAccount, signatures);
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
