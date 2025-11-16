import { isAddress } from 'gill';

/**
 * Common validation functions for form inputs
 */
export function useInputValidation() {
    const validateSolanaAddress = (address: string): boolean => {
        return isAddress(address);
    };

    const validateAmount = (amount: string): boolean => {
        const num = parseFloat(amount);
        return !isNaN(num) && num > 0;
    };

    const validatePositiveInteger = (value: string): boolean => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0 && Number.isInteger(num);
    };

    const validateDecimal = (value: string, decimals?: number): boolean => {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return false;

        if (decimals !== undefined) {
            const parts = value.split('.');
            if (parts.length > 1 && parts[1].length > decimals) {
                return false;
            }
        }

        return true;
    };

    return {
        validateSolanaAddress,
        validateAmount,
        validatePositiveInteger,
        validateDecimal,
    };
}
