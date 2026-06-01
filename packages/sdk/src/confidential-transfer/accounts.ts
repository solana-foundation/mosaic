import { type Address, fetchEncodedAccount, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { decodeMint, decodeToken, TOKEN_2022_PROGRAM_ADDRESS, type Extension } from '@solana-program/token-2022';
import { decimalAmountToRaw, resolveTokenAccount } from '../transaction-util';
import { U64_MAX } from './constants';

export function getExtensions(data: { extensions: { __option: string; value?: Extension[] } }): Extension[] {
    return data.extensions.__option === 'Some' ? (data.extensions.value ?? []) : [];
}

export function getConfidentialTransferAccountExtension(
    extensions: Extension[],
): Extract<Extension, { __kind: 'ConfidentialTransferAccount' }> {
    const extension = extensions.find(ext => ext.__kind === 'ConfidentialTransferAccount');
    if (!extension || extension.__kind !== 'ConfidentialTransferAccount') {
        throw new Error('Token account is not configured for confidential transfers');
    }
    return extension;
}

export function getConfidentialTransferMintExtension(
    extensions: Extension[],
): Extract<Extension, { __kind: 'ConfidentialTransferMint' }> {
    const extension = extensions.find(ext => ext.__kind === 'ConfidentialTransferMint');
    if (!extension || extension.__kind !== 'ConfidentialTransferMint') {
        throw new Error('Mint does not have the ConfidentialTransferMint extension');
    }
    return extension;
}

export function getTransferFeeConfigExtension(
    extensions: Extension[],
): Extract<Extension, { __kind: 'TransferFeeConfig' }> | null {
    const extension = extensions.find(ext => ext.__kind === 'TransferFeeConfig');
    return extension?.__kind === 'TransferFeeConfig' ? extension : null;
}

export function getConfidentialTransferFeeMintExtension(
    extensions: Extension[],
): Extract<Extension, { __kind: 'ConfidentialTransferFee' }> {
    const extension = extensions.find(ext => ext.__kind === 'ConfidentialTransferFee');
    if (!extension || extension.__kind !== 'ConfidentialTransferFee') {
        throw new Error('Mint does not have the ConfidentialTransferFee extension');
    }
    return extension;
}

export function unwrapAddressOption(option: { __option: string; value?: Address }): Address | null {
    return option.__option === 'Some' ? (option.value ?? null) : null;
}

export async function fetchDecodedTokenAccount(rpc: Rpc<SolanaRpcApi>, tokenAccount: Address) {
    const encodedAccount = await fetchEncodedAccount(rpc, tokenAccount);
    if (!encodedAccount.exists) {
        throw new Error(`Token account ${tokenAccount} not found`);
    }
    if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(`Token account ${tokenAccount} is not owned by Token-2022`);
    }
    return decodeToken(encodedAccount);
}

export async function fetchDecodedMint(rpc: Rpc<SolanaRpcApi>, mint: Address) {
    const encodedAccount = await fetchEncodedAccount(rpc, mint);
    if (!encodedAccount.exists) {
        throw new Error(`Mint account ${mint} not found`);
    }
    if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(`Mint ${mint} is not owned by Token-2022`);
    }
    return decodeMint(encodedAccount);
}

export function parseDecimalAmount(amount: string, decimals: number): bigint {
    const decimalAmount = Number(amount);
    if (!Number.isFinite(decimalAmount) || decimalAmount <= 0) {
        throw new Error('Amount must be a positive number');
    }
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);
    if (rawAmount > U64_MAX) {
        throw new Error('Amount exceeds the u64 token amount limit');
    }
    return rawAmount;
}

export async function getResolvedTokenAccountAddress(input: {
    rpc: Rpc<SolanaRpcApi>;
    tokenAccount?: Address;
    owner: Address;
    mint: Address;
}) {
    if (input.tokenAccount) {
        return input.tokenAccount;
    }
    const tokenAccount = await resolveTokenAccount(input.rpc, input.owner, input.mint);
    return tokenAccount.tokenAccount;
}
