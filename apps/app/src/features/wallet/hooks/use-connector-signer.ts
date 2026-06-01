'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useKitTransactionSigner, useTransactionSigner } from '@solana/connector';
import { useConnector } from '@solana/connector/react';
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

type SignMessageInput = {
    account: unknown;
    message: Uint8Array;
    chain?: string;
};

type WalletSignMessageFeature = {
    signMessage: (...inputs: readonly SignMessageInput[]) => Promise<unknown>;
};

function getWalletSignMessageFeature(wallet: unknown): WalletSignMessageFeature | null {
    if (!wallet || typeof wallet !== 'object') {
        return null;
    }

    const features = (wallet as { features?: Record<string, unknown> }).features;
    const feature = features?.['solana:signMessage'];
    if (!feature || typeof feature !== 'object') {
        return null;
    }

    const signMessage = (feature as { signMessage?: unknown }).signMessage;
    return typeof signMessage === 'function'
        ? { signMessage: signMessage as WalletSignMessageFeature['signMessage'] }
        : null;
}

function normalizeSignatureBytes(signature: unknown): SignatureBytes {
    if (signature instanceof Uint8Array) {
        if (signature.length !== 64) {
            throw new Error(`Wallet returned a ${signature.length}-byte message signature; expected 64 bytes`);
        }
        return signature as SignatureBytes;
    }

    if (Array.isArray(signature)) {
        if (signature.every(item => typeof item === 'number')) {
            return normalizeSignatureBytes(Uint8Array.from(signature));
        }
        if (signature.length === 1) {
            return normalizeSignatureBytes(signature[0]);
        }
    }

    if (signature && typeof signature === 'object' && 'signature' in signature) {
        return normalizeSignatureBytes((signature as { signature: unknown }).signature);
    }

    throw new Error('Wallet did not return a 64-byte message signature');
}

function bytesToCacheKey(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getWalletCacheIdentity(wallet: unknown): string {
    if (!wallet || typeof wallet !== 'object') {
        return '';
    }

    const name = (wallet as { name?: unknown }).name;
    const version = (wallet as { version?: unknown }).version;
    return [name, version].filter(part => typeof part === 'string').join(':') || 'connected-wallet';
}

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
    const { accounts, cluster, selectedAccount, selectedWallet } = useConnector();
    const messageSignatureCache = useRef(new Map<string, SignatureBytes>());
    const transactionSigner = kitSigner as unknown as TransactionModifyingSigner<string> | null;
    const walletAccount = useMemo(
        () => accounts.find(account => account.address === selectedAccount)?.raw ?? null,
        [accounts, selectedAccount],
    );
    const signMessageFeature = useMemo(() => getWalletSignMessageFeature(selectedWallet), [selectedWallet]);
    const selectedWalletCacheIdentity = useMemo(() => getWalletCacheIdentity(selectedWallet), [selectedWallet]);
    const canSignMessages = Boolean(
        (signMessageFeature && walletAccount) || (walletSigner?.signMessage && capabilities.canSignMessage),
    );

    useEffect(() => {
        messageSignatureCache.current.clear();
    }, [cluster?.id, selectedAccount, selectedWalletCacheIdentity]);

    const signer = useMemo(() => {
        if (!transactionSigner || !walletSigner?.signMessage || !canSignMessages) {
            return null;
        }

        return {
            address: transactionSigner.address,
            modifyAndSignTransactions: transactionSigner.modifyAndSignTransactions.bind(transactionSigner),
            signMessages: async (messages: readonly SignableMessage[]): Promise<readonly SignatureDictionary[]> => {
                const signatures: SignatureDictionary[] = [];

                for (const message of messages) {
                    const cacheKey = `${cluster?.id ?? ''}:${selectedWalletCacheIdentity}:${transactionSigner.address}:${bytesToCacheKey(message.content)}`;
                    const cachedSignature = messageSignatureCache.current.get(cacheKey);
                    const signature =
                        cachedSignature ??
                        (signMessageFeature && walletAccount
                            ? normalizeSignatureBytes(
                                  await signMessageFeature.signMessage({
                                      account: walletAccount,
                                      message: message.content,
                                      ...(cluster?.id ? { chain: cluster.id } : {}),
                                  }),
                              )
                            : normalizeSignatureBytes(await walletSigner.signMessage!(message.content)));

                    if (!cachedSignature) {
                        messageSignatureCache.current.set(cacheKey, signature);
                    }

                    signatures.push({
                        [transactionSigner.address as Address]: signature,
                    });
                }

                return signatures;
            },
        } as ConnectorConfidentialTransferSigner;
    }, [
        canSignMessages,
        cluster?.id,
        selectedWalletCacheIdentity,
        signMessageFeature,
        transactionSigner,
        walletAccount,
        walletSigner,
    ]);

    return {
        signer,
        transactionSigner,
        canSignMessages,
    };
}
