import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Address, TransactionSigner } from '@solana/kit';
import { createKeyPairSignerFromBytes, createNoopSigner } from '@solana/kit';

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

export async function resolveSigner(
    rawTx: string | undefined,
    keypairPath?: string,
    addressOverride?: string,
): Promise<{ signer: TransactionSigner<string>; address: Address }> {
    if (rawTx) {
        const address = (addressOverride || (keypairPath ? await getAddressFromKeypair(keypairPath) : undefined)) as
            | Address
            | undefined;
        if (!address) {
            throw new Error('In raw mode, provide an address for the required signer');
        }
        return { signer: createNoopSigner(address), address };
    }
    const kp = await loadKeypair(keypairPath);
    return { signer: kp, address: kp.address as Address };
}
