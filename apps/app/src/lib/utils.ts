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
        // Get mint account info with jsonParsed encoding for reliable parsing
        const accountInfo = await rpc.getAccountInfo(mintAddress, { encoding: 'jsonParsed' }).send();

        if (!accountInfo.value) {
            throw new Error(`Mint account ${mintAddress} not found`);
        }

        const data = accountInfo.value.data;
        if (!('parsed' in data) || !data.parsed?.info) {
            throw new Error(`Unable to parse mint data for ${mintAddress}`);
        }

        const mintInfo = data.parsed.info as {
            supply: string;
            decimals: number;
        };

        // Convert supply to human-readable format
        const supplyNumber = Number(mintInfo.supply);
        const formattedSupply = (supplyNumber / Math.pow(10, mintInfo.decimals)).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: mintInfo.decimals,
        });

        return formattedSupply;
    } catch {
        // Silently handle errors and return default value
        return '0';
    }
}
