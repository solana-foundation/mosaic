'use client';
import { mainnet, testnet } from 'gill';
import React, { useMemo, useState } from 'react';

import {
  ChainContext,
  ChainContextType,
  DEFAULT_CHAIN_CONFIG,
} from './ChainContext';

const STORAGE_KEY = 'solana-example-react-app:selected-chain';

interface ChainContextProviderProps {
  children: React.ReactNode;
}

export function ChainContextProvider({ children }: ChainContextProviderProps) {
  const [chain, setChain] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? 'solana:devnet'
  );
  const contextValue = useMemo<ChainContextType>(() => {
    switch (chain) {
      case 'solana:mainnet':
        if (process.env.REACT_EXAMPLE_APP_ENABLE_MAINNET === 'true') {
          return {
            chain: 'solana:mainnet',
            displayName: 'Mainnet Beta',
            solanaExplorerClusterName: 'mainnet-beta',
            solanaRpcSubscriptionsUrl: mainnet(
              'wss://api.mainnet-beta.solana.com'
            ),
            solanaRpcUrl: mainnet('https://api.mainnet-beta.solana.com'),
          };
        }
      case 'solana:testnet':
        return {
          chain: 'solana:testnet',
          displayName: 'Testnet',
          solanaExplorerClusterName: 'testnet',
          solanaRpcSubscriptionsUrl: testnet('wss://api.testnet.solana.com'),
          solanaRpcUrl: testnet('https://api.testnet.solana.com'),
        };
      case 'solana:devnet':
      default:
        if (chain !== 'solana:devnet') {
          localStorage.removeItem(STORAGE_KEY);
          console.error(`Unrecognized chain \`${chain}\``);
        }
        return DEFAULT_CHAIN_CONFIG;
    }
  }, [chain]);
  return (
    <ChainContext.Provider
      value={useMemo(
        () => ({
          ...contextValue,
          setChain(newChain: `solana:${string}`) {
            localStorage.setItem(STORAGE_KEY, newChain);
            setChain(newChain);
          },
        }),
        [contextValue]
      )}
    >
      {children}
    </ChainContext.Provider>
  );
}
