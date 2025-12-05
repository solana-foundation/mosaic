'use client';

import { useGillTransactionSigner } from '@solana/connector';
import type { TransactionModifyingSigner } from '@solana/kit';

/**
 * Creates a transaction modifying signer from the Solana connector
 * Uses the connector's native gill-compatible transaction signer
 */
export function useConnectorSigner(): TransactionModifyingSigner | null {
    const { signer } = useGillTransactionSigner();
    return signer as TransactionModifyingSigner | null;
}
