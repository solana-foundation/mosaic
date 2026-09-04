import { Command } from 'commander';
import chalk from 'chalk';
import type { Address } from '@solana/kit';
import { getMintDetails } from '@solana/mosaic-sdk';
import type { ConfidentialKeys } from '@solana/mosaic-sdk/confidential';
import { createRpcClient } from '../../utils/rpc.js';
import { createSpinner } from '../../utils/cli.js';
import { loadKeypair } from '../../utils/solana.js';
import { readGlobalOpts, resolveTokenAccount, withErrorHandling } from './common.js';

interface InspectAccountOptions {
    mint: string;
    tokenAccount?: string;
    decryptPending?: boolean;
}

/** Formats a raw base-unit amount as a decimal string for the mint's decimals. */
function formatAmount(raw: bigint, decimals: number): string {
    if (decimals === 0) return raw.toString();
    const negative = raw < 0n;
    const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0');
    const whole = digits.slice(0, -decimals);
    const frac = digits.slice(-decimals).replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

export const inspectAccountCommand = new Command('inspect-account')
    .description('Inspect the confidential-transfer state of a token account')
    .requiredOption('-m, --mint <address>', 'The token mint')
    .option('--token-account <address>', "Confidential token account (defaults to the signer's ATA)")
    .option('--decrypt-pending', 'Also decrypt the pending balance (slower ElGamal discrete log)', false)
    .showHelpAfterError()
    .action(async (options: InspectAccountOptions, command) => {
        const opts = readGlobalOpts(command);
        const spinner = createSpinner('Inspecting confidential account...');

        await withErrorHandling(spinner, 'Failed to inspect confidential account', async () => {
            const { deriveConfidentialKeysForOwnerMint, freeConfidentialKeys, inspectConfidentialAccount } =
                await import('@solana/mosaic-sdk/confidential');
            const rpc = createRpcClient(opts.rpcUrl);
            const mint = options.mint as Address;

            // Best-effort keypair load for owner derivation + decryption. Inspection
            // still works without one (ciphertexts only).
            const signer = opts.rawTx ? null : await loadKeypair(opts.keypairPath).catch(() => null);
            const owner = signer?.address ?? (opts.authority as Address | undefined);
            if (!options.tokenAccount && !owner) {
                throw new Error('Provide --token-account, or a keypair / --authority to derive the ATA.');
            }
            const tokenAccount = await resolveTokenAccount(mint, owner as Address, options.tokenAccount);

            // Only derive keys (and decrypt) when inspecting the signer's own ATA — keys
            // derived for another owner can't decrypt someone else's balances.
            let keys: ConfidentialKeys | undefined;
            if (signer && !options.tokenAccount) {
                keys = await deriveConfidentialKeysForOwnerMint({ signer, owner: signer.address, mint });
            }

            try {
                const info = await inspectConfidentialAccount(rpc, tokenAccount, keys, {
                    decryptPendingBalance: options.decryptPending,
                });
                spinner.stop();

                if (!info) {
                    console.log(
                        chalk.yellow(
                            `Account ${tokenAccount} is not a Token-2022 confidential account (no ConfidentialTransferAccount extension).`,
                        ),
                    );
                    return;
                }

                const { decimals } = await getMintDetails(rpc, mint);

                console.log(chalk.cyan('\n🔎 Confidential Account'));
                console.log(`   ${chalk.bold('Token Account:')} ${info.tokenAccount}`);
                console.log(`   ${chalk.bold('Mint:')} ${mint}`);
                console.log(`   ${chalk.bold('Approved:')} ${info.approved}`);
                console.log(`   ${chalk.bold('ElGamal Pubkey:')} ${info.elgamalPubkey}`);
                console.log(`   ${chalk.bold('Allow Confidential Credits:')} ${info.allowConfidentialCredits}`);
                console.log(`   ${chalk.bold('Allow Non-Confidential Credits:')} ${info.allowNonConfidentialCredits}`);
                console.log(
                    `   ${chalk.bold('Pending Balance Credit Counter:')} ${info.pendingBalanceCreditCounter} / ${info.maximumPendingBalanceCreditCounter} (max)`,
                );

                if (info.decrypted) {
                    console.log(chalk.cyan('🔓 Decrypted Balances:'));
                    console.log(
                        `   ${chalk.bold('Available:')} ${formatAmount(info.decrypted.availableBalance, decimals)}`,
                    );
                    if (info.decrypted.pendingBalance !== undefined) {
                        console.log(
                            `   ${chalk.bold('Pending:')} ${formatAmount(info.decrypted.pendingBalance, decimals)}`,
                        );
                    } else {
                        console.log(`   ${chalk.dim('Pending:')} ${chalk.dim('(pass --decrypt-pending to decrypt)')}`);
                    }
                } else {
                    console.log(
                        chalk.dim('   Decrypted balances unavailable (run with the account owner keypair to decrypt).'),
                    );
                }

                console.log(chalk.cyan('🔐 Ciphertexts (base64):'));
                console.log(`   ${chalk.bold('Available Balance:')} ${info.ciphertexts.availableBalance}`);
                console.log(`   ${chalk.bold('Pending Balance (lo):')} ${info.ciphertexts.pendingBalanceLow}`);
                console.log(`   ${chalk.bold('Pending Balance (hi):')} ${info.ciphertexts.pendingBalanceHigh}`);
            } finally {
                if (keys) freeConfidentialKeys(keys);
            }
        });
    });
