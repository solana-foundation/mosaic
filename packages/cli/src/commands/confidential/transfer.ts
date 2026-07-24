import { Command } from 'commander';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, printResult, readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface TransferOptions {
    mint: string;
    to: string;
    amount: string;
    tokenAccount?: string;
    toTokenAccount?: string;
    auditorElgamalPubkey?: string;
}

export const transferCommand = new Command('transfer')
    .description('Confidentially transfer tokens to another confidential account')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .requiredOption('--to <address>', 'Recipient owner address (its ATA is used as the destination)')
    .requiredOption('--amount <decimal>', 'Amount to transfer (decimal, e.g. 1.5)')
    .option('--token-account <address>', "Source confidential token account (defaults to the signer's ATA)")
    .option('--to-token-account <address>', "Explicit destination token account (overrides the recipient's ATA)")
    .option('--auditor-elgamal-pubkey <address>', "Override the auditor pubkey (defaults to the mint's auditor)")
    .showHelpAfterError()
    .action(async (options: TransferOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Preparing confidential transfer...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to complete confidential transfer', async () => {
            const {
                createConfidentialTransferInstructionPlan,
                deriveConfidentialKeysForOwnerMint,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const sourceToken = await resolveTokenAccount(mint, signer.address, options.tokenAccount);
            const destinationToken = options.toTokenAccount
                ? (options.toTokenAccount as Address)
                : await resolveTokenAccount(mint, options.to as Address);

            const keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            try {
                const plan = await createConfidentialTransferInstructionPlan({
                    rpc,
                    payer: signer,
                    mint,
                    sourceToken,
                    destinationToken,
                    authority: signer,
                    amount: options.amount,
                    keys,
                    auditorElgamalPubkey: options.auditorElgamalPubkey as Address | undefined,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential transfer complete!');
                printResult('Confidential Transfer Complete', mint, sourceToken, signatures);
                console.log(`   ${'Destination:'} ${destinationToken}`);
            } finally {
                freeConfidentialKeys(keys);
            }
        });
    });
