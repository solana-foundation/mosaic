import { useState, useEffect } from 'react';
import { useConnector, useGillSolanaClient } from '@solana/connector/react';
import type { Address } from 'gill';

export function useWalletBalance() {
    const { selectedAccount } = useConnector();
    const { client } = useGillSolanaClient();
    const [balance, setBalance] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchBalance() {
            if (!selectedAccount || !client) {
                setBalance(null);
                return;
            }

            setIsLoading(true);
            try {
                const result = await client.rpc.getBalance(selectedAccount as Address).send();
                // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                setBalance(Number(result) / 1_000_000_000);
            } catch {
                setBalance(null);
            } finally {
                setIsLoading(false);
            }
        }

        fetchBalance();
    }, [selectedAccount, client]);

    return { balance, isLoading };
}
