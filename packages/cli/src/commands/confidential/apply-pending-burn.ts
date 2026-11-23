import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { resolveSigners } from '../../utils/solana.js';
import { loadSupplyKeysSigner, parseRawSupply, printSignatures, readGlobalOpts, withErrorHandling } from './common.js';

interface ApplyPendingBurnOptions {
    mint: string;
    supply: string;
    supplyKeypair?: string;
}

export const applyPendingBurnCommand = new Command('apply-pending-burn')
    .description("Apply the mint's accumulated pending burn into its confidential supply (mint authority)")
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption(
        '--supply <amount>',
        'The true total supply AFTER this apply, in raw base units (integer). Required: the apply re-encrypts the decryptable supply in the same plan, and omitting it would leave the mint unable to mint again.',
    )
    .option(
        '--supply-keypair <path>',
        "Keypair file of the mint's supply authority, whose keys encrypt the supply (defaults to --keypair)",
    )
    .showHelpAfterError()
    .action(async (options: ApplyPendingBurnOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Applying pending burn...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to apply pending burn', async () => {
            const { createApplyConfidentialPendingBurnInstructionPlan, deriveConfidentialKeys, freeConfidentialKeys } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const supply = parseRawSupply(options.supply);
            const { authority, feePayer } = await resolveSigners(opts);
            const supplyAuthority = await loadSupplyKeysSigner(opts, options.supplyKeypair);
            const mint = options.mint as Address;

            // ApplyPendingBurn advances the ElGamal `confidentialSupply` but cannot re-encrypt the
            // AES `decryptableSupply`, so the two drift apart and the next confidential mint's
            // equality proof (built from the AES value, checked against the ElGamal one) fails on
            // chain with no useful hint. Re-asserting the supply in the same plan keeps the mint
            // usable.
            const supplyKeys = await deriveConfidentialKeys({ signer: supplyAuthority });
            try {
                const plan = await createApplyConfidentialPendingBurnInstructionPlan({
                    rpc,
                    mint,
                    authority,
                    resyncSupply: { supplyKeys, rawSupply: supply },
                });
                const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts, spinner);
                if (raw) return;
                spinner.succeed('Pending burn applied!');
                console.log(chalk.green('\n✅ Pending Burn Applied'));
                console.log(chalk.cyan('📋 Details:'));
                console.log(`   ${chalk.bold('Mint:')} ${mint}`);
                console.log(`   ${chalk.bold('Supply (raw):')} ${supply} ${chalk.gray('(re-asserted)')}`);
                printSignatures(signatures);
            } finally {
                freeConfidentialKeys(supplyKeys);
            }
        });
    });
