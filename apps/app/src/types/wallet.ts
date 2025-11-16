export interface WalletAdapter {
    publicKey: {
        toString(): string;
    } | null;
    connected: boolean;
    signTransaction?: (transaction: unknown) => Promise<unknown>;
    signAllTransactions?: (transactions: unknown[]) => Promise<unknown[]>;
}
