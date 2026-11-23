import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { resolveSigners } from '../../utils/solana.js';
import { loadSupplyKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface MintOptions {
    mint: string;
    amount: string;
    to: string;
    toTokenAccount?: string;
    auditorElgamalPubkey?: string;
    supplyKeypair?: string;
}

export const mintCommand = new Command('mint')
    .description('Confidentially mint tokens directly into a confidential balance (encrypted supply)')
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--amount <decimal>', 'Amount to mint (decimal, e.g. 1.5)')
    .requiredOption('--to <address>', 'Recipient owner address (its ATA is used as the destination)')
    .option('--to-token-account <address>', "Explicit destination token account (overrides the recipient's ATA)")
    .option(
        '--supply-keypair <path>',
        "Keypair file of the mint's supply authority, whose keys encrypt the supply (defaults to --keypair)",
    )
    .option('--auditor-elgamal-pubkey <address>', "Override the auditor pubkey (defaults to the mint's auditor)")
    .showHelpAfterError()
    .action(async (options: MintOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential mint...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to complete confidential mint', async () => {
            const { createConfidentialMintInstructionPlan, deriveConfidentialKeys, freeConfidentialKeys } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The mint authority signs. The supply authority only supplies the keys the supply is
            // encrypted under, and the builder checks them against the mint's registered pubkey.
            const { authority, feePayer } = await resolveSigners(opts);
            const supplyAuthority = await loadSupplyKeysSigner(opts, options.supplyKeypair);
            const mint = options.mint as Address;
            const destinationToken = await resolveTokenAccount(mint, options.to as Address, options.toTokenAccount);

            const supplyKeys = await deriveConfidentialKeys({ signer: supplyAuthority });
            try {
                const plan = await createConfidentialMintInstructionPlan({
                    rpc,
                    payer: feePayer,
                    mint,
                    destinationToken,
                    authority,
                    amount: options.amount,
                    supplyKeys,
                    auditorElgamalPubkey: options.auditorElgamalPubkey as Address | undefined,
                });
                const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts, spinner);
                if (raw) return;
                spinner.succeed('Confidential mint complete!');
                printResult('Confidential Mint Complete', mint, destinationToken, signatures);
            } finally {
                freeConfidentialKeys(supplyKeys);
            }
        });
    });
