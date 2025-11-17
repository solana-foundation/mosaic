'use client';

import { useGillTransactionSigner } from '@solana/connector';

/**
 * Creates a transaction sending signer from the Solana connector
 * Uses the connector's native gill-compatible transaction signer
 */
export function useConnectorSigner() {
    const { signer } = useGillTransactionSigner();
    return signer;
}

