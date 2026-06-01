'use client';

import { useMemo } from 'react';
import { useKitTransactionSigner, useTransactionSigner } from '@solana/connector';
import type {
    Address,
    SignatureBytes,
    SignatureDictionary,
    SignableMessage,
    TransactionModifyingSigner,
} from '@solana/kit';
import type { ConfidentialTransferAuthoritySigner } from '@solana/mosaic-sdk';

export type ConnectorConfidentialTransferSigner = TransactionModifyingSigner<string> &
    ConfidentialTransferAuthoritySigner<string>;

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

export function useConnectorConfidentialTransferSigner(): {
    signer: ConnectorConfidentialTransferSigner | null;
    transactionSigner: TransactionModifyingSigner<string> | null;
    canSignMessages: boolean;
} {
    const { signer: kitSigner } = useKitTransactionSigner();
    const { signer: walletSigner, capabilities } = useTransactionSigner();
    const transactionSigner = kitSigner as unknown as TransactionModifyingSigner<string> | null;
    const canSignMessages = Boolean(walletSigner?.signMessage && capabilities.canSignMessage);

    const signer = useMemo(() => {
        if (!transactionSigner || !walletSigner?.signMessage || !canSignMessages) {
            return null;
        }

        return {
            ...transactionSigner,
            signMessages: async (messages: readonly SignableMessage[]): Promise<readonly SignatureDictionary[]> =>
                Promise.all(
                    messages.map(async message => ({
                        [transactionSigner.address as Address]: (await walletSigner.signMessage!(
                            message.content,
                        )) as SignatureBytes,
                    })),
                ),
        } as ConnectorConfidentialTransferSigner;
    }, [canSignMessages, transactionSigner, walletSigner]);

    return {
        signer,
        transactionSigner,
        canSignMessages,
    };
}
