import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { resolveSigners } from '../../utils/solana.js';
import { loadSupplyKeysSigner, parseRawSupply, printSignatures, readGlobalOpts, withErrorHandling } from './common.js';

interface UpdateSupplyOptions {
    mint: string;
    supply: string;
    supplyKeypair?: string;
}

export const updateSupplyCommand = new Command('update-supply')
    .description("Re-assert the mint's decryptable supply under the supply AES key (mint authority)")
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--supply <amount>', 'The true current supply, in raw base units (integer)')
    .option(
        '--supply-keypair <path>',
        "Keypair file of the mint's supply authority, whose keys encrypt the supply (defaults to --keypair)",
    )
    .showHelpAfterError()
    .action(async (options: UpdateSupplyOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Updating confidential supply...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to update confidential supply', async () => {
            const {
                createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan,
                deriveConfidentialKeys,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const supply = parseRawSupply(options.supply);
            // The mint authority signs; the supply authority's keys re-encrypt the supply.
            const { authority, feePayer } = await resolveSigners(opts);
            const supplyAuthority = await loadSupplyKeysSigner(opts, options.supplyKeypair);
            const mint = options.mint as Address;

            const supplyKeys = await deriveConfidentialKeys({ signer: supplyAuthority });
            try {
                const plan = await createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                    rpc,
                    mint,
                    authority,
                    supplyKeys,
                    rawSupply: supply,
                });
                const { raw, signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts, spinner);
                if (raw) return;
                spinner.succeed('Confidential supply updated!');
                console.log(chalk.green('\n✅ Confidential Supply Updated'));
                console.log(chalk.cyan('📋 Details:'));
                console.log(`   ${chalk.bold('Mint:')} ${mint}`);
                console.log(`   ${chalk.bold('Supply (raw):')} ${supply}`);
                printSignatures(signatures);
            } finally {
                freeConfidentialKeys(supplyKeys);
            }
        });
    });
