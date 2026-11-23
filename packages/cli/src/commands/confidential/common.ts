import chalk from 'chalk';
import type { Ora } from 'ora';
import type { Address, Signature } from '@solana/kit';

export * from './options.js';

/** Prints a success block with the mint, token account, and each transaction signature. */
export function printResult(title: string, mint: string, tokenAccount: Address, signatures?: Signature[]): void {
    console.log(chalk.green(`\n✅ ${title}`));
    console.log(chalk.cyan('📋 Details:'));
    console.log(`   ${chalk.bold('Mint:')} ${mint}`);
    console.log(`   ${chalk.bold('Token Account:')} ${tokenAccount}`);
    printSignatures(signatures);
}

/** Prints each transaction signature, numbered when there are several. */
export function printSignatures(signatures?: Signature[]): void {
    if (!signatures) return;
    signatures.forEach((sig, i) => {
        const label = signatures.length > 1 ? `Transaction ${i + 1}:` : 'Transaction:';
        console.log(`   ${chalk.bold(label)} ${sig}`);
    });
}

/** Program logs hide on `error.context.logs`, or a nested `cause` — dig them out. */
function findLogs(error: unknown, depth = 0): string[] | undefined {
    if (depth > 4 || !error || typeof error !== 'object') return undefined;
    const ctx = (error as { context?: { logs?: unknown } }).context;
    if (ctx && Array.isArray(ctx.logs) && ctx.logs.length > 0) return ctx.logs as string[];
    return findLogs((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * A readable one-liner for anything that can be thrown. `error.message` alone is not enough:
 * kit's `SolanaError` carries its detail on `context`, some rejections are plain objects, and a
 * thrown non-Error would otherwise collapse to 'Unknown error'.
 */
export function describeThrown(error: unknown, depth = 0): string {
    if (typeof error === 'string') return error;
    if (!error || typeof error !== 'object') return String(error);

    const parts: string[] = [];
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) parts.push(message);

    const code = (error as { code?: unknown }).code;
    if (code !== undefined) parts.push(`code ${String(code)}`);

    // `context` holds a SolanaError's structured detail (instruction index, the program's own
    // error code), the part that actually identifies the failure.
    const ctx = (error as { context?: Record<string, unknown> }).context;
    if (ctx && typeof ctx === 'object') {
        const detail = Object.entries(ctx)
            .filter(([k, v]) => k !== 'logs' && v !== undefined && typeof v !== 'object')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(', ');
        if (detail) parts.push(detail);
    }

    if (parts.length === 0) {
        // Nothing conventional to read: show the shape rather than 'Unknown error'.
        try {
            const json = JSON.stringify(error, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
            if (json && json !== '{}') parts.push(json);
        } catch {
            /* circular or otherwise unserialisable: fall through */
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
 * Wraps a subcommand body with the shared error handling: print a description of the error and,
 * when present, the program logs, then exit 1.
 */
export async function withErrorHandling(spinner: Ora, failMessage: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (error) {
        spinner.fail(failMessage);
        console.error(chalk.red('❌ Error:'), describeThrown(error));
        // Print the logs too, not instead: a confidential proof rejection says what went wrong
        // only in the program logs, while the error object says where.
        const logs = findLogs(error);
        if (logs) {
            console.error(chalk.red('❌ Program logs:'), `\n\t${logs.join('\n\t')}`);
        }
        process.exit(1);
    }
}
