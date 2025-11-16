'use client';
import { createSolanaRpc, createSolanaRpcSubscriptions } from 'gill';
import React, { useContext, useMemo } from 'react';

import { ChainContext } from './ChainContext';
import { RpcContext } from './RpcContext';

interface RpcContextProviderProps {
    children: React.ReactNode;
}

export function RpcContextProvider({ children }: RpcContextProviderProps) {
    const { solanaRpcSubscriptionsUrl, solanaRpcUrl } = useContext(ChainContext);
    return (
        <RpcContext.Provider
            value={useMemo(
                () => ({
                    rpc: createSolanaRpc(solanaRpcUrl),
                    rpcSubscriptions: createSolanaRpcSubscriptions(solanaRpcSubscriptionsUrl),
                }),
                [solanaRpcSubscriptionsUrl, solanaRpcUrl],
            )}
        >
            {children}
        </RpcContext.Provider>
    );
}
