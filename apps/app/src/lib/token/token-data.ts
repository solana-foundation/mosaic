import { TokenDisplay } from '@/types/token';
import { TokenStorage } from './token-storage';

// Function to find token by address
export const findTokenByAddress = (address: string): TokenDisplay | null => {
    return TokenStorage.findTokenByAddress(address);
};

// Function to get all tokens from local storage
export const getAllTokens = (): TokenDisplay[] => {
    return TokenStorage.getAllTokens();
};

// Function to get tokens by type
export const getTokensByType = (type: string): TokenDisplay[] => {
    return TokenStorage.getTokensByType(type);
};

// Function to get token count
export const getTokenCount = (): number => {
    return TokenStorage.getTokenCount();
};
