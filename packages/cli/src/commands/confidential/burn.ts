import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeypair } from '../../utils/solana.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface BurnOptions {
    mint: string;
    amount: string;
    tokenAccount?: string;
    auditorElgamalPubkey?: string;
    permissionedBurnKeypair?: string;
}

export const burnCommand = new Command('burn')
    .description('Confidentially burn tokens directly from a confidential balance (encrypted supply)')
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--amount <decimal>', 'Amount to burn (decimal, e.g. 1.5)')
    .option('--token-account <address>', "Source confidential token account (defaults to the signer's ATA)")
    .option('--auditor-elgamal-pubkey <address>', "Override the auditor pubkey (defaults to the mint's auditor)")
    .option(
        '--permissioned-burn-keypair <path>',
        'Keypair for the permissioned burn authority (only needed when it differs from the signer on permissioned burn mints)',
    )
    .showHelpAfterError()
    .action(async (options: BurnOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential burn...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to complete confidential burn', async () => {
            const { createConfidentialBurnInstructionPlan, deriveConfidentialKeys, freeConfidentialKeys } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the account owner — burn is authored with the owner's
            // wallet-only account keys, as with transfer/withdraw (not the mint's supply
            // keys, which only `confidential mint` and `confidential update-supply` use).
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const tokenAccount = await resolveTokenAccount(rpc, mint, signer.address, options.tokenAccount);

            // On a permissioned burn mint the burn authority co-signs. When it is the signer itself,
            // reuse that signer: Kit rejects two distinct signers for one address.
            const heldBurnAuthority = options.permissionedBurnKeypair
                ? await loadKeypair(options.permissionedBurnKeypair)
                : undefined;
            const permissionedBurnAuthority =
                heldBurnAuthority?.address === signer.address ? signer : (heldBurnAuthority ?? signer);

            const keys = await deriveConfidentialKeys({ signer });
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
                    permissionedBurnAuthority,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts, spinner);
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
