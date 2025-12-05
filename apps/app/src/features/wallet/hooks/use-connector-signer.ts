'use client';

import { useKitTransactionSigner } from '@solana/connector';
import type { TransactionModifyingSigner } from '@solana/kit';

/**
 * Creates a transaction modifying signer from the Solana connector
 * Uses the connector's native kit-compatible transaction signer
 */
export function useConnectorSigner(): TransactionModifyingSigner<string> | null {
    const { signer } = useKitTransactionSigner();
    // Cast through unknown to bridge the generic signature difference between
    // @solana/connector's signer type and @solana/kit's TransactionModifyingSigner
    return signer as unknown as TransactionModifyingSigner<string> | null;
}
