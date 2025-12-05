import { TokenDisplay } from '@/types/token';

/**
 * Fetch image URL from off-chain metadata JSON
 * Supports standard metadata format (Metaplex-compatible)
 */
export async function fetchImageFromUri(uri: string): Promise<string | undefined> {
    try {
        const response = await fetch(uri);
        if (!response.ok) return undefined;

        const metadata = await response.json();
        // Standard metadata format has 'image' field
        return metadata.image || undefined;
    } catch {
        // Silently fail - off-chain metadata fetch is best-effort
        return undefined;
    }
}

/**
 * Helper function to convert creation result to TokenDisplay
 */
export const createTokenDisplayFromResult = async (
    result: {
        mintAddress?: string;
        transactionSignature?: string;
        details?: {
            name?: string;
            symbol?: string;
            decimals?: number;
            mintAuthority?: string;
            metadataAuthority?: string;
            pausableAuthority?: string;
            confidentialBalancesAuthority?: string;
            permanentDelegateAuthority?: string;
            scaledUiAmountAuthority?: string;
            extensions?: string[];
        };
    },
    type: 'stablecoin' | 'arcade-token' | 'tokenized-security' | 'custom-token',
    options: {
        name: string;
        symbol: string;
        uri?: string;
        enableSrfc37?: boolean;
    },
    creatorWallet?: string,
): Promise<TokenDisplay> => {
    // Guard: ensure mintAddress exists before creating TokenDisplay
    if (!result?.mintAddress) {
        const errorMessage = `Cannot create TokenDisplay: mintAddress is missing for token type "${type}" (name: "${options.name}", symbol: "${options.symbol}")`;
        // eslint-disable-next-line no-console
        console.error('[createTokenDisplayFromResult]', errorMessage, {
            result,
            type,
            options,
            creatorWallet,
        });
        throw new Error(errorMessage);
    }

    // Map custom-token to unknown for SDK compatibility
    const sdkType = type === 'custom-token' ? 'unknown' : type;

    // Fetch image from metadata URI if available
    let image: string | undefined;
    if (options.uri) {
        image = await fetchImageFromUri(options.uri);
    }

    return {
        name: result.details?.name || options.name,
        symbol: result.details?.symbol || options.symbol,
        address: result.mintAddress,
        detectedPatterns: [sdkType],
        decimals: result.details?.decimals,
        mintAuthority: result.details?.mintAuthority,
        metadataAuthority: result.details?.metadataAuthority,
        pausableAuthority: result.details?.pausableAuthority,
        confidentialBalancesAuthority: result.details?.confidentialBalancesAuthority,
        permanentDelegateAuthority: result.details?.permanentDelegateAuthority,
        scaledUiAmountAuthority: result.details?.scaledUiAmountAuthority,
        extensions: result.details?.extensions,
        transactionSignature: result.transactionSignature,
        isSrfc37: options.enableSrfc37,
        metadataUri: options.uri,
        image,
        supply: '0', // Initial supply is 0 for new tokens
        creatorWallet,
    };
};
