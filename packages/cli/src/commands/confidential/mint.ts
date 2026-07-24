import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface MintOptions {
    mint: string;
    amount: string;
    to: string;
    toTokenAccount?: string;
    auditorElgamalPubkey?: string;
}

export const mintCommand = new Command('mint')
    .description('Confidentially mint tokens directly into a confidential balance (encrypted supply)')
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--amount <decimal>', 'Amount to mint (decimal, e.g. 1.5)')
    .requiredOption('--to <address>', 'Recipient owner address (its ATA is used as the destination)')
    .option('--to-token-account <address>', "Explicit destination token account (overrides the recipient's ATA)")
    .option('--auditor-elgamal-pubkey <address>', "Override the auditor pubkey (defaults to the mint's auditor)")
    .showHelpAfterError()
    .action(async (options: MintOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential mint...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to complete confidential mint', async () => {
            const { createConfidentialMintInstructionPlan, deriveConfidentialSupplyKeys, freeConfidentialKeys } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the mint's supply authority — supply keys are bound to
            // (mintAuthority, mint), so this must be the same keypair used at create time.
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const destinationToken = options.toTokenAccount
                ? (options.toTokenAccount as Address)
                : await resolveTokenAccount(mint, options.to as Address);

            const supplyKeys = await deriveConfidentialSupplyKeys({ signer, mint });
            try {
                const plan = await createConfidentialMintInstructionPlan({
                    rpc,
                    payer: signer,
                    mint,
                    destinationToken,
                    authority: signer,
                    amount: options.amount,
                    supplyKeys,
                    auditorElgamalPubkey: options.auditorElgamalPubkey as Address | undefined,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential mint complete!');
                printResult('Confidential Mint Complete', mint, destinationToken, signatures);
            } finally {
                freeConfidentialKeys(supplyKeys);
            }
        });
    });
