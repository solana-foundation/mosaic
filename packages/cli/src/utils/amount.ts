export function validateDecimalAmount(amount: string): void {
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(amount) || !/[1-9]/.test(amount)) {
        throw new Error('Amount must be a positive decimal number');
    }
}
