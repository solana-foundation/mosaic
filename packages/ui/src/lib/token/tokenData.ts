import { TokenDisplay } from '@/types/token';
import { TokenStorage } from './tokenStorage';

// Legacy token data for backward compatibility
const legacyTokenData: TokenDisplay[] = [
  {
    name: 'AadilUSD',
    symbol: 'AUSD',
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    supply: '78548',
    type: 'stablecoin',
  },
  {
    name: 'AadilMiles',
    symbol: 'AMLS',
    address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    supply: '985474',
    type: 'arcade-token',
  },
];

// Function to find token by address
export const findTokenByAddress = (address: string): TokenDisplay | null => {
  return TokenStorage.findTokenByAddress(address);
};

// Function to get all tokens from local storage
export const getAllTokens = (): TokenDisplay[] => {
  const storedTokens = TokenStorage.getAllTokens();

  // If no tokens in storage, return legacy data for demo purposes
  if (storedTokens.length === 0) {
    return legacyTokenData;
  }

  return storedTokens;
};

// Function to get tokens by type
export const getTokensByType = (type: string): TokenDisplay[] => {
  return TokenStorage.getTokensByType(type);
};

// Function to get token count
export const getTokenCount = (): number => {
  return TokenStorage.getTokenCount();
};
