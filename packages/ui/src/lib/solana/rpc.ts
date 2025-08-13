import {
  createSolanaRpc,
  type Rpc,
  type SolanaRpcApi,
  type Address,
} from 'gill';
import { TOKEN_2022_PROGRAM_ADDRESS, decodeMint } from 'gill/programs/token';
import { fetchEncodedAccount } from '@solana/accounts';

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

    // Fetch account using @solana/kit like inspect-mint does
    const mintAddressTyped = mintAddress as Address;
    const encodedAccount = await fetchEncodedAccount(rpc, mintAddressTyped);

    if (!encodedAccount.exists) {
      throw new Error('Mint account not found');
    }

    // Check if this is a Token-2022 mint
    if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
      throw new Error(
        `Not a Token-2022 mint (owner: ${encodedAccount.programAddress})`
      );
    }

    // Decode mint data using gill's decodeMint
    const decodedMint = decodeMint(encodedAccount);

    // Extract basic authorities
    const authorities: TokenAuthorities = {
      mintAuthority:
        decodedMint.data.mintAuthority?.__option === 'Some'
          ? decodedMint.data.mintAuthority.value
          : undefined,
      freezeAuthority:
        decodedMint.data.freezeAuthority?.__option === 'Some'
          ? decodedMint.data.freezeAuthority.value
          : undefined,
    };

    // Extract extension authorities
    if (
      decodedMint.data.extensions &&
      decodedMint.data.extensions.__option === 'Some'
    ) {
      for (const ext of decodedMint.data.extensions.value) {
        if (!ext.__kind) continue;

        switch (ext.__kind) {
          case 'TokenMetadata':
            if ('updateAuthority' in ext && ext.updateAuthority) {
              authorities.metadataAuthority =
                ext.updateAuthority.__option === 'Some'
                  ? ext.updateAuthority.value
                  : undefined;
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
                ext.authority.__option === 'Some'
                  ? ext.authority.value
                  : undefined;
            }
            break;
          case 'PausableConfig':
            if ('authority' in ext && ext.authority) {
              authorities.pausableAuthority =
                ext.authority.__option === 'Some'
                  ? ext.authority.value
                  : undefined;
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
  _rpcUrl?: string
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
