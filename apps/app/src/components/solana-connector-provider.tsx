'use client';

import { ConnectorProvider } from '@solana/connector/react';
import { useContext } from 'react';
import { ChainContext } from '@/context/ChainContext';

interface SolanaConnectorProviderProps {
    children: React.ReactNode;
}

export function SolanaConnectorProvider({ children }: SolanaConnectorProviderProps) {
    const { chain } = useContext(ChainContext);
    
    // Map chain to cluster configuration for @solana/connector
    const cluster = chain === 'solana:mainnet' 
        ? { id: 'solana:mainnet', label: 'Mainnet Beta' }
        : chain === 'solana:testnet'
        ? { id: 'solana:testnet', label: 'Testnet' }
        : { id: 'solana:devnet', label: 'Devnet' };

    return (
        <ConnectorProvider cluster={cluster}>
            {children}
        </ConnectorProvider>
    );
}

