import { useState, useEffect } from 'react';
import { useConnector, useGillSolanaClient } from '@solana/connector/react';
import type { Address } from 'gill';

export function useWalletBalance() {
    const { selectedAccount } = useConnector();
    const { client } = useGillSolanaClient();
    const [balance, setBalance] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let canceled = false;
        let requestId = 0;

        async function fetchBalance() {
            if (!selectedAccount || !client) {
                if (!canceled) {
                    setBalance(null);
                    setError(null);
                }
                return;
            }

            const currentRequestId = ++requestId;
            canceled = false;

            if (!canceled && currentRequestId === requestId) {
                setIsLoading(true);
            }

            try {
                const result = await client.rpc.getBalance(selectedAccount as Address).send();
                // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                if (!canceled && currentRequestId === requestId) {
                    setBalance(Number(result) / 1_000_000_000);
                    setError(null);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to fetch wallet balance', err);
                if (!canceled && currentRequestId === requestId) {
                    setBalance(null);
                    setError(err instanceof Error ? err.message : 'Failed to fetch wallet balance');
                }
            } finally {
                if (!canceled && currentRequestId === requestId) {
                    setIsLoading(false);
                }
            }
        }

        fetchBalance();

        return () => {
            canceled = true;
            requestId++;
        };
    }, [selectedAccount, client]);

    return { balance, isLoading, error };
}
