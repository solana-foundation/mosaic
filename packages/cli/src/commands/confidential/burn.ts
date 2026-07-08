import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface BurnOptions {
    mint: string;
    amount: string;
    tokenAccount?: string;
    auditorElgamalPubkey?: string;
}

export const burnCommand = new Command('burn')
    .description('Confidentially burn tokens directly from a confidential balance (encrypted supply)')
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--amount <decimal>', 'Amount to burn (decimal, e.g. 1.5)')
    .option('--token-account <address>', "Source confidential token account (defaults to the signer's ATA)")
    .option('--auditor-elgamal-pubkey <address>', "Override the auditor pubkey (defaults to the mint's auditor)")
    .showHelpAfterError()
    .action(async (options: BurnOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential burn...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to complete confidential burn', async () => {
            const { createConfidentialBurnInstructionPlan, deriveConfidentialKeysForOwnerMint, freeConfidentialKeys } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the account owner — burn is authored with account keys
            // bound to (owner, mint), as with transfer/withdraw.
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(mint, signer.address, options.tokenAccount);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createConfidentialBurnInstructionPlan({
                    rpc,
                    payer: signer,
                    mint,
                    tokenAccount,
                    authority: signer,
                    amount: options.amount,
                    keys,
                    auditorElgamalPubkey: options.auditorElgamalPubkey as Address | undefined,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential burn complete!');
                printResult('Confidential Burn Complete', mint, tokenAccount, signatures);
                console.log(
                    `   Note: run 'confidential apply-pending-burn' as the mint authority to finalize the supply.`,
                );
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
