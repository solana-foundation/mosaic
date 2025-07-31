import { createSolanaRpc, type Rpc, type SolanaRpcApi } from 'gill';

export interface TokenAuthorities {
  mintAuthority?: string;
  freezeAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
}

/**
 * Creates a Solana RPC client
 * @param rpcUrl - Optional RPC URL, defaults to devnet
 * @returns RPC client instance
 */
export function createRpcClient(rpcUrl?: string): Rpc<SolanaRpcApi> {
  const url = rpcUrl || 'https://api.devnet.solana.com';
  return createSolanaRpc(url);
}

/**
 * Fetches current authorities for a token mint
 * @param mintAddress - The mint address to fetch authorities for
 * @param rpcUrl - Optional RPC URL
 * @returns Promise with current authorities
 */
export async function getTokenAuthorities(
  mintAddress: string,
  rpcUrl?: string
): Promise<TokenAuthorities> {
  try {
    const rpc = createRpcClient(rpcUrl);
    
    // Get mint account data using RPC
    const accountInfo = await rpc
      .getAccountInfo(mintAddress as any, { encoding: 'jsonParsed' })
      .send();

    if (!accountInfo.value) {
      throw new Error('Mint account not found');
    }

    const data = accountInfo.value.data;
    if (!('parsed' in data) || !data.parsed?.info) {
      throw new Error('Unable to parse mint data');
    }

    const mintInfo = data.parsed.info as {
      decimals: number;
      freezeAuthority?: string;
      mintAuthority?: string;
      extensions?: any[];
    };

    return {
      mintAuthority: mintInfo.mintAuthority,
      freezeAuthority: mintInfo.freezeAuthority,
      // Extension authorities are stored in separate extension accounts
      // and require different RPC calls to fetch. For now, we'll return
      // undefined as these need to be implemented separately.
      metadataAuthority: undefined,
      pausableAuthority: undefined,
      confidentialBalancesAuthority: undefined,
      permanentDelegateAuthority: undefined,
    };
  } catch (error) {
    console.error('Error fetching token authorities:', error);
    throw error;
  }
}

/**
 * Fetches extension authorities for a token mint
 * This is a placeholder for extension-specific authority fetching
 * In a real implementation, you would need to fetch each extension's data separately
 */
export async function getExtensionAuthorities(
  mintAddress: string,
  rpcUrl?: string
): Promise<Partial<TokenAuthorities>> {
  try {
    const rpc = createRpcClient(rpcUrl);
    
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
    console.error('Error fetching extension authorities:', error);
    throw error;
  }
} 