import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { type Rpc, type SolanaRpcApiMainnet, type Address } from 'gill';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Gets the current supply of a token mint from the blockchain
 * @param rpc - The Solana RPC client instance
 * @param mintAddress - The mint address of the token
 * @returns Promise with the formatted supply string
 */
export async function getTokenSupply(rpc: Rpc<SolanaRpcApiMainnet>, mintAddress: Address): Promise<string> {
    try {
        // Get mint account info
        const accountInfo = await rpc.getAccountInfo(mintAddress, { encoding: 'base64' }).send();

        if (!accountInfo.value) {
            throw new Error(`Mint account ${mintAddress} not found`);
        }

        // Parse mint data to get supply and decimals
        // In Token-2022, supply is at offset 36-44 and decimals at offset 44
        const data = Buffer.from(accountInfo.value.data[0], 'base64');

        // Read supply (8 bytes starting at offset 36)
        const supplyBuffer = data.slice(36, 44);
        const supply = supplyBuffer.readBigUInt64LE();

        // Read decimals (1 byte at offset 44)
        const decimals = data[44];

        // Convert supply to human-readable format
        const supplyNumber = Number(supply);
        const formattedSupply = (supplyNumber / Math.pow(10, decimals)).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        });

        return formattedSupply;
    } catch {
        // Silently handle errors and return default value
        return '0';
    }
}
