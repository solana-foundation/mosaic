import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { Extension } from '@solana-program/token-2022';
import {
    fetchDecodedMint,
    getConfidentialTransferFeeMintExtension,
    getConfidentialTransferMintExtension,
    getExtensions,
    getTransferFeeConfigExtension,
} from './accounts';

type ConfidentialTransferMintExtension = Extract<Extension, { __kind: 'ConfidentialTransferMint' }>;
type ConfidentialTransferFeeMintExtension = Extract<Extension, { __kind: 'ConfidentialTransferFee' }>;
type TransferFeeConfigExtension = Extract<Extension, { __kind: 'TransferFeeConfig' }>;

export type ConfidentialTransferMintContext = {
    mint: Address;
    decimals: number;
    extensions: Extension[];
    confidentialTransferMint: ConfidentialTransferMintExtension;
    transferFeeConfig: TransferFeeConfigExtension | null;
};

export async function fetchConfidentialTransferMintContext(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
}): Promise<ConfidentialTransferMintContext> {
    const decodedMint = await fetchDecodedMint(input.rpc, input.mint);
    const extensions = getExtensions(decodedMint.data);

    return {
        mint: input.mint,
        decimals: decodedMint.data.decimals,
        extensions,
        confidentialTransferMint: getConfidentialTransferMintExtension(extensions),
        transferFeeConfig: getTransferFeeConfigExtension(extensions),
    };
}

export function requireConfidentialTransferFeeMintExtension(
    context: ConfidentialTransferMintContext,
): ConfidentialTransferFeeMintExtension {
    return getConfidentialTransferFeeMintExtension(context.extensions);
}
