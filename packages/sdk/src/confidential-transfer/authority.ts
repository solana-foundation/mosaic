import type { Address, MessagePartialSigner, TransactionSigner } from '@solana/kit';

export type ConfidentialTransferMessageSigner<TAddress extends string = string> = MessagePartialSigner<TAddress>;

export type ConfidentialTransferAuthoritySigner<TAddress extends string = string> = TransactionSigner<TAddress> &
    ConfidentialTransferMessageSigner<TAddress>;

export const CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE =
    'Confidential transfer operations require a wallet or keypair that can sign messages for key derivation';

export function confidentialTransferAuthorityMismatchMessage(input: {
    requestedAuthority: Address | string;
    signerAddress: Address | string;
}): string {
    return `Confidential transfer proof/key flows require --authority (${input.requestedAuthority}) to match the local keypair address (${input.signerAddress})`;
}

export function hasConfidentialTransferMessageSigning(
    signer: unknown,
): signer is ConfidentialTransferMessageSigner<string> {
    if (!signer || typeof signer !== 'object') {
        return false;
    }

    const candidate = signer as {
        address?: unknown;
        signMessages?: unknown;
    };
    return typeof candidate.address === 'string' && typeof candidate.signMessages === 'function';
}

export function assertConfidentialTransferMessageSigner<TAddress extends string = string>(
    signer: unknown,
): asserts signer is ConfidentialTransferMessageSigner<TAddress> {
    if (!hasConfidentialTransferMessageSigning(signer)) {
        throw new Error(CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE);
    }
}

export function asConfidentialTransferAuthoritySigner<TAddress extends string>(
    signer: TransactionSigner<TAddress> & Partial<ConfidentialTransferMessageSigner<TAddress>>,
): ConfidentialTransferAuthoritySigner<TAddress> {
    assertConfidentialTransferMessageSigner<TAddress>(signer);
    return signer;
}

export function assertConfidentialTransferAuthorityMatchesSigner(input: {
    requestedAuthority?: Address | string;
    signerAddress: Address | string;
}): void {
    if (input.requestedAuthority && input.requestedAuthority !== input.signerAddress) {
        throw new Error(
            confidentialTransferAuthorityMismatchMessage({
                requestedAuthority: input.requestedAuthority,
                signerAddress: input.signerAddress,
            }),
        );
    }
}
