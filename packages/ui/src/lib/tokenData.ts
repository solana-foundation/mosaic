import { TokenDisplay } from '@/types/token';

// Token data definitions
export const tokenData: TokenDisplay[] = [
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
  return tokenData.find(token => token.address === address) || null;
};

// Function to get all tokens
export const getAllTokens = (): TokenDisplay[] => {
  return tokenData;
};
