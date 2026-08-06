import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, readGlobalOpts, withErrorHandling } from './common.js';

interface UpdateSupplyOptions {
    mint: string;
    supply: string;
}

export const updateSupplyCommand = new Command('update-supply')
    .description("Re-assert the mint's decryptable supply under the supply AES key (mint authority)")
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption('--supply <amount>', 'The true current supply, in raw base units (integer)')
    .showHelpAfterError()
    .action(async (options: UpdateSupplyOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Updating confidential supply...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to update confidential supply', async () => {
            const {
                createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan,
                deriveConfidentialSupplyKeys,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the mint / supply authority — supply keys are bound to
            // (mintAuthority, mint), matching the keypair used at create time.
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;

            let supply: bigint;
            try {
                supply = BigInt(options.supply);
            } catch {
                throw new Error('--supply must be an integer in raw base units (e.g. 10000000)');
            }
            if (supply < 0n) {
                throw new Error('--supply must be a non-negative integer');
            }

            const supplyKeys = await deriveConfidentialSupplyKeys({ signer, mint });
            try {
                const plan = createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan({
                    mint,
                    authority: signer,
                    supplyKeys,
                    supply,
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, signer, rpc, opts.rawTx, spinner);
                spinner.succeed('Confidential supply updated!');
                console.log(chalk.green('\n✅ Confidential Supply Updated'));
                console.log(chalk.cyan('📋 Details:'));
                console.log(`   ${chalk.bold('Mint:')} ${mint}`);
                console.log(`   ${chalk.bold('Supply (raw):')} ${supply}`);
                if (signatures && signatures.length > 0) {
                    signatures.forEach((sig, i) => {
                        const label = signatures.length > 1 ? `Transaction ${i + 1}:` : 'Transaction:';
                        console.log(`   ${chalk.bold(label)} ${sig}`);
                    });
                }
            } finally {
                freeConfidentialKeys(supplyKeys);
            }
        });
    });
