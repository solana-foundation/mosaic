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

/** Program logs hide on `error.context.logs`, or a nested `cause` — dig them out. */
function findLogs(error: unknown, depth = 0): string[] | undefined {
    if (depth > 4 || !error || typeof error !== 'object') return undefined;
    const ctx = (error as { context?: { logs?: unknown } }).context;
    if (ctx && Array.isArray(ctx.logs) && ctx.logs.length > 0) return ctx.logs as string[];
    return findLogs((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * A readable one-liner for anything that can be thrown. `error.message` alone is
 * not enough: kit's `SolanaError` carries its detail on `context`, some rejections
 * are plain objects, and a thrown non-Error used to collapse to 'Unknown error'.
 */
function describeThrown(error: unknown, depth = 0): string {
    if (typeof error === 'string') return error;
    if (!error || typeof error !== 'object') return String(error);

    const parts: string[] = [];
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) parts.push(message);

    const code = (error as { code?: unknown }).code;
    if (code !== undefined) parts.push(`code ${String(code)}`);

    // `context` holds a SolanaError's structured detail (instruction index, the
    // program's own error code) — the part that actually identifies the failure.
    const ctx = (error as { context?: Record<string, unknown> }).context;
    if (ctx && typeof ctx === 'object') {
        const detail = Object.entries(ctx)
            .filter(([k, v]) => k !== 'logs' && v !== undefined && typeof v !== 'object')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(', ');
        if (detail) parts.push(detail);
    }

    if (parts.length === 0) {
        // Nothing conventional to read — show the shape rather than 'Unknown error'.
        try {
            const json = JSON.stringify(error, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
            if (json && json !== '{}') parts.push(json);
        } catch {
            /* circular or otherwise unserialisable — fall through */
        }
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined && depth < 4) {
        const described = describeThrown(cause, depth + 1);
        if (described && !parts.includes(described)) parts.push(`caused by: ${described}`);
    }

    return parts.length > 0 ? parts.join(' — ') : Object.prototype.toString.call(error);
}

/**
 * Wraps a subcommand body with the shared error handling used across the CLI:
 * surface the program logs when present, always surface a description of the
 * error itself, then exit 1.
 */
export async function withErrorHandling(spinner: Ora, failMessage: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (error) {
        spinner.fail(failMessage);
        console.error(chalk.red('❌ Error:'), describeThrown(error));
        // Print the logs too, not instead: a confidential proof rejection says what
        // went wrong only in the program logs, while the error object says where.
        const logs = findLogs(error);
        if (logs) {
            console.error(chalk.red('❌ Program logs:'), `\n\t${logs.join('\n\t')}`);
        }
        process.exit(1);
    }
}
