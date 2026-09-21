import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { sendOrOutputInstructionPlan } from '../../utils/instruction-plan.js';
import { loadKeysSigner, readGlobalOpts, resolveFeePayer, withErrorHandling } from './common.js';

interface ApplyPendingBurnOptions {
    mint: string;
    supply: string;
}

export const applyPendingBurnCommand = new Command('apply-pending-burn')
    .description("Apply the mint's accumulated pending burn into its confidential supply (mint authority)")
    .requiredOption('-m, --mint <address>', 'The token mint (must carry the ConfidentialMintBurn extension)')
    .requiredOption(
        '--supply <amount>',
        'The true total supply AFTER this apply, in raw base units (integer). Required: the apply re-encrypts the decryptable supply in the same plan, and omitting it would leave the mint unable to mint again.',
    )
    .showHelpAfterError()
    .action(async (options: ApplyPendingBurnOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Applying pending burn...', opts.rawTx);

        await withErrorHandling(spinner, 'Failed to apply pending burn', async () => {
            const {
                createApplyConfidentialPendingBurnInstructionPlan,
                deriveConfidentialSupplyKeys,
                freeConfidentialKeys,
            } = await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            // The signer here is the mint / supply authority. It must be a real keypair:
            // the re-sync below re-encrypts the decryptable supply under the supply AES
            // key, which is derived from this signer, so this cannot run in --raw-tx mode.
            const signer = await loadKeysSigner(opts);
            const mint = options.mint as Address;
            const feePayer = resolveFeePayer(opts, signer);

            let supply: bigint;
            try {
                supply = BigInt(options.supply);
            } catch {
                throw new Error('--supply must be an integer in raw base units (e.g. 10000000)');
            }
            if (supply < 0n) {
                throw new Error('--supply must be a non-negative integer');
            }

            // ApplyPendingBurn advances the ElGamal `confidentialSupply` but cannot
            // re-encrypt the AES `decryptableSupply`, so the two drift apart and the
            // next confidential mint's equality proof — built from the AES value and
            // checked against the ElGamal one — fails on-chain with no useful hint.
            // Re-asserting the supply in the same plan is what keeps the mint usable.
            const supplyKeys = await deriveConfidentialSupplyKeys({ signer, mint });
            try {
                const plan = createApplyConfidentialPendingBurnInstructionPlan({
                    mint,
                    authority: signer,
                    resyncSupply: { supplyKeys, rawSupply: supply },
                });
                const { signatures } = await sendOrOutputInstructionPlan(plan, feePayer, rpc, opts.rawTx, spinner);
                spinner.succeed('Pending burn applied!');
                console.log(chalk.green('\n✅ Pending Burn Applied'));
                console.log(chalk.cyan('📋 Details:'));
                console.log(`   ${chalk.bold('Mint:')} ${mint}`);
                console.log(`   ${chalk.bold('Supply (raw):')} ${supply} ${chalk.gray('(re-asserted)')}`);
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
