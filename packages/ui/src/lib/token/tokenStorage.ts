import { TokenDisplay } from '@/types/token';

const STORAGE_KEY = 'mosaic_tokens';

/**
 * Token storage utility for managing created tokens in local storage
 */
export class TokenStorage {
  /**
   * Get all tokens from local storage
   */
  static getAllTokens(): TokenDisplay[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const tokens = JSON.parse(stored) as TokenDisplay[];
      return Array.isArray(tokens) ? tokens : [];
    } catch (error) {
      console.error('Error reading tokens from localStorage:', error);
      return [];
    }
  }

  /**
   * Save a new token to local storage
   */
  static saveToken(token: TokenDisplay): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const existingTokens = this.getAllTokens();

      // Check if token already exists (by address)
      const existingIndex = existingTokens.findIndex(
        t => t.address === token.address
      );

      if (existingIndex >= 0) {
        // Update existing token
        existingTokens[existingIndex] = {
          ...existingTokens[existingIndex],
          ...token,
          createdAt:
            existingTokens[existingIndex].createdAt || new Date().toISOString(),
        };
      } else {
        // Add new token
        const newToken = {
          ...token,
          createdAt: new Date().toISOString(),
        };
        existingTokens.push(newToken);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingTokens));
    } catch (error) {
      console.error('Error saving token to localStorage:', error);
    }
  }

  /**
   * Save multiple tokens to local storage
   */
  static saveTokens(tokens: TokenDisplay[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
      console.error('Error saving tokens to localStorage:', error);
    }
  }

  /**
   * Find a token by its address
   */
  static findTokenByAddress(address: string): TokenDisplay | null {
    const tokens = this.getAllTokens();
    return tokens.find(token => token.address === address) || null;
  }

  /**
   * Delete a token by its address
   */
  static deleteToken(address: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const tokens = this.getAllTokens();
      const filteredTokens = tokens.filter(token => token.address !== address);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredTokens));
    } catch (error) {
      console.error('Error deleting token from localStorage:', error);
    }
  }

  /**
   * Clear all tokens from local storage
   */
  static clearAllTokens(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing tokens from localStorage:', error);
    }
  }

  /**
   * Get tokens by type
   */
  static getTokensByType(type: string): TokenDisplay[] {
    const tokens = this.getAllTokens();
    return tokens.filter(token => token.type === type);
  }

  /**
   * Get the total number of tokens
   */
  static getTokenCount(): number {
    return this.getAllTokens().length;
  }
}

/**
 * Helper function to convert creation result to TokenDisplay
 */
export const createTokenDisplayFromResult = (
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
      extensions?: string[];
    };
  },
  type: 'stablecoin' | 'arcade-token',
  options: {
    name: string;
    symbol: string;
    uri?: string;
  }
): TokenDisplay => {
  return {
    name: result.details?.name || options.name,
    symbol: result.details?.symbol || options.symbol,
    address: result.mintAddress,
    type: type,
    decimals: result.details?.decimals,
    mintAuthority: result.details?.mintAuthority,
    metadataAuthority: result.details?.metadataAuthority,
    pausableAuthority: result.details?.pausableAuthority,
    confidentialBalancesAuthority:
      result.details?.confidentialBalancesAuthority,
    permanentDelegateAuthority: result.details?.permanentDelegateAuthority,
    extensions: result.details?.extensions,
    transactionSignature: result.transactionSignature,
    metadataUri: options.uri,
    supply: '0', // Initial supply is 0 for new tokens
  };
};
