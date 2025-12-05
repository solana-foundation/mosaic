import { useState, useEffect, useMemo } from 'react';
import { useConnector, useCluster } from '@solana/connector/react';
import { type Address, createSolanaRpc } from 'gill';

export function useWalletBalance() {
    const { selectedAccount } = useConnector();
    const { cluster } = useCluster();
    const [balance, setBalance] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create RPC client from current cluster URL
    const rpc = useMemo(() => {
        if (!cluster?.url) return null;
        return createSolanaRpc(cluster.url);
    }, [cluster?.url]);

    useEffect(() => {
        let canceled = false;
        let requestId = 0;

        async function fetchBalance() {
            if (!selectedAccount || !rpc) {
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
                const result = await rpc.getBalance(selectedAccount as Address).send();
                // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                if (!canceled && currentRequestId === requestId) {
                    setBalance(Number(result.value) / 1_000_000_000);
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
    }, [selectedAccount, rpc]);

    return { balance, isLoading, error };
}
