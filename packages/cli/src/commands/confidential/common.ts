import type { Command } from 'commander';
import chalk from 'chalk';
import type { Ora } from 'ora';
import { type Address, type Signature, type TransactionSigner, createNoopSigner } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { getGlobalOpts } from '../../utils/cli.js';
import { loadKeypair } from '../../utils/solana.js';

/** The global options every confidential subcommand reads off the root program. */
export interface ConfidentialGlobalOpts {
    rpcUrl?: string;
    keypairPath?: string;
    rawTx?: string;
    authority?: string;
    feePayer?: string;
}

export function readGlobalOpts(command: Command): ConfidentialGlobalOpts {
    const opts = getGlobalOpts(command);
    return {
        rpcUrl: opts.rpcUrl,
        keypairPath: opts.keypair,
        rawTx: opts.rawTx,
        authority: opts.authority,
        feePayer: opts.feePayer,
    };
}

/**
 * Loads the real keypair for operations that derive confidential keys (which needs a
 * secret key). These cannot run in `--raw-tx`/noop-signer mode, so error out early
 * with an actionable message rather than failing deep in key derivation.
 */
export async function loadKeysSigner(opts: ConfidentialGlobalOpts) {
    if (opts.rawTx) {
        throw new Error(
            'This operation derives confidential keys and cannot run in --raw-tx mode. Run it with a real keypair (omit --raw-tx).',
        );
    }
    return loadKeypair(opts.keypairPath);
}

/**
 * Resolves the token account to operate on: the explicit `--token-account` when
 * given, otherwise the owner's associated token account (ATA) for the mint.
 */
export async function resolveTokenAccount(mint: Address, owner: Address, explicit?: string): Promise<Address> {
    if (explicit) return explicit as Address;
    const [ata] = await findAssociatedTokenPda({ owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });
    return ata;
}

/**
 * Picks the fee-payer signer for planning. In `--raw-tx` mode with an explicit
 * `--fee-payer` address, use a no-op signer for it; otherwise the operation's own
 * signer pays.
 */
export function resolveFeePayer(opts: ConfidentialGlobalOpts, fallback: TransactionSigner): TransactionSigner {
    if (opts.rawTx && opts.feePayer) return createNoopSigner(opts.feePayer as Address);
    return fallback;
}

/** Prints a success block with the mint, token account, and each transaction signature. */
export function printResult(title: string, mint: string, tokenAccount: Address, signatures?: Signature[]): void {
    console.log(chalk.green(`\n✅ ${title}`));
    console.log(chalk.cyan('📋 Details:'));
    console.log(`   ${chalk.bold('Mint:')} ${mint}`);
    console.log(`   ${chalk.bold('Token Account:')} ${tokenAccount}`);
    if (signatures && signatures.length > 0) {
        signatures.forEach((sig, i) => {
            const label = signatures.length > 1 ? `Transaction ${i + 1}:` : 'Transaction:';
            console.log(`   ${chalk.bold(label)} ${sig}`);
        });
    }
}

/**
 * Wraps a subcommand body with the shared error handling used across the CLI:
 * surface simulation logs when present, otherwise the error message, then exit 1.
 */
export async function withErrorHandling(spinner: Ora, failMessage: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (error) {
        spinner.fail(failMessage);
        if (error && typeof error === 'object' && 'context' in error) {
            const typedError = error as { context: { logs: string[] } };
            console.error(
                chalk.red('❌ Transaction simulation failed:'),
                `\n\t${typedError.context.logs.join('\n\t')}`,
            );
        } else {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
        }
        process.exit(1);
    }
}
