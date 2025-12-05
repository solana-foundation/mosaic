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
            throw new Error(
                `Unable to parse mint data for ${mintAddress}In apps/app/src/lib/utils.ts around lines 36-40, the code converts mintInfo.supply to a JavaScript Number which can lose precision for large raw supplies; replace Number-based math with BigInt arithmetic: parse the raw supply as BigInt, compute divisor = 10n ** BigInt(mintInfo.decimals), then compute whole = supplyBigInt / divisor and frac = supplyBigInt % divisor; format whole with toLocaleString('en-US'), build the fractional string by left-padding frac.toString() to mintInfo.decimals, trim trailing zeros (and omit the decimal part if it becomes empty), and combine whole and trimmed fractional parts into the final formattedSupply string; ensure you handle missing/zero decimals and invalid supply inputs gracefully (fallback to "0" or an empty/fallback value) and do not convert the BigInt into a Number during formatting.`,
            );
        }

        const mintInfo = data.parsed.info as {
            supply: string;
            decimals: number;
        };

        // Convert supply to human-readable format using BigInt to preserve precision
        const supplyStr = mintInfo.supply ?? '0';
        const decimals = mintInfo.decimals ?? 0;

        // Handle invalid or empty supply
        if (!supplyStr || !/^\d+$/.test(supplyStr)) {
            return '0';
        }

        const supplyBigInt = BigInt(supplyStr);

        // Handle zero decimals case
        if (decimals === 0) {
            return supplyBigInt.toLocaleString('en-US');
        }

        const divisor = 10n ** BigInt(decimals);
        const whole = supplyBigInt / divisor;
        const frac = supplyBigInt % divisor;

        // Format whole part with locale
        const wholeFormatted = whole.toLocaleString('en-US');

        // Build fractional part: left-pad to decimals length, then trim trailing zeros
        const fracStr = frac.toString().padStart(decimals, '0');
        const fracTrimmed = fracStr.replace(/0+$/, '');

        // Combine parts (omit decimal if fractional part is empty)
        const formattedSupply = fracTrimmed ? `${wholeFormatted}.${fracTrimmed}` : wholeFormatted;

        return formattedSupply;
    } catch {
        // Silently handle errors and return default value
        return '0';
    }
}
