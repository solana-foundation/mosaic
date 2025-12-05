import { createSolanaRpc, createSolanaRpcSubscriptions, type Rpc, type SolanaRpcApi, type RpcSubscriptions, type SolanaRpcSubscriptionsApi, type Address, type Commitment } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS, decodeMint } from '@solana-program/token-2022';
import { fetchEncodedAccount } from '@solana/accounts';

/**
 * Default commitment level for transactions.
 * Can be overridden via NEXT_PUBLIC_SOLANA_COMMITMENT env var.
 * Valid values: 'processed', 'confirmed', 'finalized'
 */
const DEFAULT_COMMITMENT: Commitment = 'confirmed';

/**
 * Gets the Solana commitment level from environment variable or returns the default.
 * Reads from NEXT_PUBLIC_SOLANA_COMMITMENT environment variable.
 * Falls back to 'confirmed' if not set or invalid.
 *
 * @returns Commitment level string
 */
export function getCommitment(): Commitment {
    const envCommitment = process.env.NEXT_PUBLIC_SOLANA_COMMITMENT;
    if (envCommitment && ['processed', 'confirmed', 'finalized'].includes(envCommitment)) {
        return envCommitment as Commitment;
    }
    return DEFAULT_COMMITMENT;
}

export interface TokenAuthorities {
    mintAuthority?: string;
    freezeAuthority?: string;
    metadataAuthority?: string;
    pausableAuthority?: string;
    confidentialBalancesAuthority?: string;
    permanentDelegateAuthority?: string;
    scaledUiAmountAuthority?: string;
}

/**
 * Gets the Solana RPC URL from environment variable or returns a default fallback.
 * Reads from NEXT_PUBLIC_SOLANA_RPC_URL environment variable.
 * Falls back to devnet if not set.
 *
 * @param overrideUrl - Optional RPC URL to override the default behavior
 * @returns RPC URL string
 */
export function getRpcUrl(overrideUrl?: string): string {
    if (overrideUrl) {
        return overrideUrl;
    }
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
}

/**
 * Default localhost RPC URL (Solana validator)
 */
const LOCALHOST_RPC_URL = 'http://127.0.0.1:8899';

/**
 * Default localhost WebSocket URL (Solana validator uses different port)
 */
const LOCALHOST_WS_URL = 'ws://127.0.0.1:8900';

/**
 * Converts an HTTP(S) RPC URL to a WebSocket URL.
 * Handles both standard URLs and URLs with ports/paths.
 * Special handling for localhost since Solana validator uses different ports (8899 for HTTP, 8900 for WS).
 *
 * @param rpcUrl - The HTTP(S) RPC URL to convert
 * @returns WebSocket URL string
 */
export function getWsUrl(rpcUrl: string): string {
    // Handle localhost special case (Solana validator uses different ports for HTTP and WS)
    if (rpcUrl === LOCALHOST_RPC_URL || rpcUrl === 'http://localhost:8899') {
        return LOCALHOST_WS_URL;
    }

    try {
        const url = new URL(rpcUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.toString();
    } catch {
        // Fallback for invalid URLs
        return rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    }
}

/**
 * Creates a Solana RPC client
 * @param rpcUrl - Optional RPC URL, defaults to NEXT_PUBLIC_SOLANA_RPC_URL or devnet
 * @returns RPC client instance
 */
export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
    const url = getRpcUrl(rpcUrl);
    return createSolanaRpc(url);
}

/**
 * Creates a Solana RPC subscriptions client
 * @param rpcUrl - Optional RPC URL, defaults to NEXT_PUBLIC_SOLANA_RPC_URL or devnet
 * @returns RPC subscriptions client instance
 */
export function createRpcSubscriptions(rpcUrl?: string): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
    const url = getRpcUrl(rpcUrl);
    const wsUrl = getWsUrl(url);
    return createSolanaRpcSubscriptions(wsUrl);
}

/**
 * Fetches current authorities for a token mint
 * @param mintAddress - The mint address to fetch authorities for
 * @param rpcUrl - Optional RPC URL
 * @returns Promise with current authorities
 */
export async function getTokenAuthorities(mintAddress: string, rpcUrl?: string): Promise<TokenAuthorities> {
    try {
        const rpc = createRpcClient(rpcUrl);

        // Fetch account using @solana/kit like inspect-mint does
        const mintAddressTyped = mintAddress as Address;
        const encodedAccount = await fetchEncodedAccount(rpc, mintAddressTyped);

        if (!encodedAccount.exists) {
            throw new Error('Mint account not found');
        }

        // Check if this is a Token-2022 mint
        if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
            throw new Error(`Not a Token-2022 mint (owner: ${encodedAccount.programAddress})`);
        }

        // Decode mint data using gill's decodeMint
        const decodedMint = decodeMint(encodedAccount);

        // Extract basic authorities
        const authorities: TokenAuthorities = {
            mintAuthority:
                decodedMint.data.mintAuthority?.__option === 'Some' ? decodedMint.data.mintAuthority.value : undefined,
            freezeAuthority:
                decodedMint.data.freezeAuthority?.__option === 'Some'
                    ? decodedMint.data.freezeAuthority.value
                    : undefined,
        };

        // Extract extension authorities
        if (decodedMint.data.extensions && decodedMint.data.extensions.__option === 'Some') {
            for (const ext of decodedMint.data.extensions.value) {
                if (!ext.__kind) continue;

                switch (ext.__kind) {
                    case 'TokenMetadata':
                        if ('updateAuthority' in ext && ext.updateAuthority) {
                            authorities.metadataAuthority =
                                ext.updateAuthority.__option === 'Some' ? ext.updateAuthority.value : undefined;
                        }
                        break;
                    case 'PermanentDelegate':
                        if ('delegate' in ext) {
                            authorities.permanentDelegateAuthority = ext.delegate;
                        }
                        break;
                    case 'ConfidentialTransferMint':
                        if ('authority' in ext && ext.authority) {
                            authorities.confidentialBalancesAuthority =
                                ext.authority.__option === 'Some' ? ext.authority.value : undefined;
                        }
                        break;
                    case 'PausableConfig':
                        if ('authority' in ext && ext.authority) {
                            authorities.pausableAuthority =
                                ext.authority.__option === 'Some' ? ext.authority.value : undefined;
                        }
                        break;
                    case 'ScaledUiAmountConfig':
                        if ('authority' in ext && ext.authority) {
                            authorities.scaledUiAmountAuthority = ext.authority;
                        }
                        break;
                }
            }
        }

        return authorities;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetches extension authorities for a token mint
 * This is a placeholder for extension-specific authority fetching
 * In a real implementation, you would need to fetch each extension's data separately
 */
export async function getExtensionAuthorities(
    _mintAddress: string,
    _rpcUrl?: string,
): Promise<Partial<TokenAuthorities>> {
    try {
        // TODO: Implement extension-specific authority fetching
        // This would require fetching each extension's account data
        // For now, return empty object as placeholder

        return {
            metadataAuthority: undefined,
            pausableAuthority: undefined,
            confidentialBalancesAuthority: undefined,
            permanentDelegateAuthority: undefined,
        };
    } catch (error) {
        throw error;
    }
}
