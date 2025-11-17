'use client';

import { useGillTransactionSigner } from '@solana/connector';
import type { TransactionModifyingSigner } from '@solana/signers';

/**
 * Creates a transaction modifying signer from the Solana connector
 * Uses the connector's native gill-compatible transaction signer
 */
export function useConnectorSigner(): TransactionModifyingSigner<string> | null {
    const { signer } = useGillTransactionSigner();
    return signer;
}

