import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Address, TransactionSigner } from '@solana/kit';
import { createKeyPairSignerFromBytes, createNoopSigner, isAddress } from '@solana/kit';
import type { GlobalOptions } from './global-options.js';

export interface SolanaConfig {
    json_rpc_url: string;
    websocket_url: string;
    keypair_path: string;
    address_labels: Record<string, string>;
    commitment: string;
}

export function getDefaultKeypairPath(): string {
    return join(homedir(), '.config', 'solana', 'id.json');
}

export function getSolanaConfig(): SolanaConfig | null {
    try {
        const configPath = join(homedir(), '.config', 'solana', 'cli', 'config.yml');
        const configContent = readFileSync(configPath, 'utf-8');

        const config: Partial<SolanaConfig> = {};

        configContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                const value = valueParts.join(':').trim();
                switch (key.trim()) {
                    case 'json_rpc_url':
                        config.json_rpc_url = value;
                        break;
                    case 'websocket_url':
                        config.websocket_url = value;
                        break;
                    case 'keypair_path':
                        config.keypair_path = value;
                        break;
                    case 'commitment':
                        config.commitment = value;
                        break;
                }
            }
        });

        return config as SolanaConfig;
    } catch {
        return null;
    }
}

export async function loadKeypair(keypairPath?: string) {
    const path = keypairPath || getSolanaConfig()?.keypair_path || getDefaultKeypairPath();

    try {
        const keypairData = JSON.parse(readFileSync(path, 'utf-8'));
        const keypairBytes = new Uint8Array(keypairData);
        return await createKeyPairSignerFromBytes(keypairBytes);
    } catch (error) {
        throw new Error(
            `Failed to load keypair from ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
}

export async function getAddressFromKeypair(keypairPath?: string): Promise<Address> {
    const keypair = await loadKeypair(keypairPath);
    return keypair.address;
}

function parseAddressFlag(flag: string, value: string): Address {
    if (!isAddress(value)) {
        throw new Error(`${flag} is not a valid address: ${value}`);
    }
    return value;
}

function assertSignsAs(flag: string, expected: string | undefined, keypairAddress: Address): void {
    if (expected && expected !== keypairAddress) {
        throw new Error(
            `${flag} ${expected} does not match the --keypair signer ${keypairAddress}. ` +
                'Without --raw-tx the CLI signs with --keypair, so it must be that address. ' +
                'Use --raw-tx to build the transaction for another signer.',
        );
    }
}

/**
 * Resolves one required signer.
 *
 * - With `--raw-tx` nothing is signed here, so the result is a noop signer. Its address is
 *   `addressOverride` when given. Only without an override is a keypair read (`keypairPath`,
 *   else the Solana CLI default), and only for its address.
 * - Without `--raw-tx` the keypair is loaded and signs. An override naming any other address is
 *   rejected: the CLI cannot sign for it, so the transaction could only fail at send time.
 *
 * @param overrideFlag - The flag `addressOverride` came from, for error messages.
 */
export async function resolveSigner(
    rawTx: string | undefined,
    keypairPath?: string,
    addressOverride?: string,
    overrideFlag = '--authority',
): Promise<{ signer: TransactionSigner<string>; address: Address }> {
    if (rawTx) {
        if (addressOverride) {
            const address = parseAddressFlag(overrideFlag, addressOverride);
            return { signer: createNoopSigner(address), address };
        }
        let address: Address;
        try {
            address = await getAddressFromKeypair(keypairPath);
        } catch (error) {
            throw new Error(
                `With --raw-tx, pass ${overrideFlag} <address> for the required signer, or a --keypair to take it from. ` +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
        return { signer: createNoopSigner(address), address };
    }
    const kp = await loadKeypair(keypairPath);
    assertSignsAs(overrideFlag, addressOverride, kp.address);
    return { signer: kp, address: kp.address };
}

/**
 * Resolves the authority and fee payer a command builds its transaction with, via `resolveSigner`.
 *
 * The fee payer is `--fee-payer` in raw mode and defaults to the authority. Without `--raw-tx`
 * both are the `--keypair` signer, and a `--fee-payer` naming another address is rejected.
 *
 * @param authorityOverride - The authority address; defaults to the global `--authority`.
 * @param authorityFlag - The flag the override came from, for error messages.
 * @param held - Keys the command itself holds, such as a mint keypair or a
 *   `--permissioned-burn-keypair` co-signer. A role at one of their addresses resolves to that
 *   exact signer: Kit rejects a transaction carrying two distinct signers for one address.
 */
export async function resolveSigners(
    opts: Pick<GlobalOptions, 'rawTx' | 'keypair' | 'authority' | 'feePayer'>,
    authorityOverride: string | undefined = opts.authority,
    authorityFlag = '--authority',
    held: ReadonlyArray<TransactionSigner<string> | undefined> = [],
): Promise<{ authority: TransactionSigner<string>; feePayer: TransactionSigner<string> }> {
    const preferHeld = (signer: TransactionSigner<string>) =>
        held.find(key => key?.address === signer.address) ?? signer;

    const { signer: authority } = await resolveSigner(opts.rawTx, opts.keypair, authorityOverride, authorityFlag);
    if (!opts.rawTx) {
        assertSignsAs('--fee-payer', opts.feePayer, authority.address);
        const signer = preferHeld(authority);
        return { authority: signer, feePayer: signer };
    }
    if (!opts.feePayer || opts.feePayer === authority.address) {
        const signer = preferHeld(authority);
        return { authority: signer, feePayer: signer };
    }
    const { signer: feePayer } = await resolveSigner(opts.rawTx, undefined, opts.feePayer, '--fee-payer');
    return { authority: preferHeld(authority), feePayer: preferHeld(feePayer) };
}
