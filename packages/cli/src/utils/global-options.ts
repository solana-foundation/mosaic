import type { Command, OptionValues } from 'commander';

/** The program-level options every command reads through `getGlobalOpts`. */
export interface GlobalOptions {
    rpcUrl?: string;
    keypair?: string;
    authority?: string;
    feePayer?: string;
    rawTx?: string;
}

/**
 * Declares the global options on the root program.
 *
 * `--raw-tx` must have no default. Commands branch on its truthiness, so a default value would
 * put every command in raw mode permanently and make `--keypair` dead weight (HOO-962).
 *
 * `--rpc-url` must have no default either: `resolveRpcUrl` falls back to the Solana CLI config,
 * then devnet, and a commander default would hide the config.
 */
export function addGlobalOptions(program: Command): Command {
    return program
        .option('--rpc-url <url>', 'Solana RPC URL (defaults to the Solana CLI config, then devnet)')
        .option('--keypair <path>', 'Path to keypair file (defaults to Solana CLI default)')
        .option(
            '--authority <address>',
            'Authority address for --raw-tx (without --raw-tx it must match the --keypair signer)',
        )
        .option('--fee-payer <address>', 'Fee payer address for --raw-tx (defaults to the authority)')
        .option(
            '--raw-tx <encoding>',
            'Print the transaction for an external signer instead of signing and sending it (b64|b58)',
        );
}

export function getGlobalOpts(command: Command): OptionValues {
    // Safely attempts parent->parent then parent; falls back to empty object
    const parentParent = command.parent?.parent?.opts?.();
    if (parentParent) return parentParent;
    const parent = command.parent?.opts?.();
    return parent || {};
}
