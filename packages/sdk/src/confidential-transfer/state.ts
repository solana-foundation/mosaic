import { type Address, fetchEncodedAccount, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { decodeToken, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    fetchDecodedTokenAccount,
    getConfidentialTransferAccountExtension,
    getExtensions,
    getResolvedTokenAccountAddress,
} from './accounts';
import { aeCiphertextFromBytes, ciphertextFromBytes } from './ciphertext';
import { TRANSFER_AMOUNT_LO_BITS } from './constants';
import { deriveConfidentialTransferKeys } from './key-derivation';
import type { ConfidentialTransferMessageSigner } from './authority';
import type { ConfidentialTransferAccountStatus, ConfidentialTransferBalances } from './types';
import { loadZkSdk } from './zk-sdk';

export async function getConfidentialTransferAccountStatus(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    tokenAccount?: Address;
}): Promise<ConfidentialTransferAccountStatus> {
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const maybeAccount = await fetchEncodedAccount(input.rpc, tokenAccount);
    if (!maybeAccount.exists) {
        return {
            tokenAccount,
            exists: false,
            configured: false,
            publicBalance: 0n,
            approved: null,
            elgamalPubkey: null,
            allowConfidentialCredits: null,
            allowNonConfidentialCredits: null,
            pendingBalanceCreditCounter: null,
            maximumPendingBalanceCreditCounter: null,
        };
    }
    if (maybeAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(`Token account ${tokenAccount} is not owned by Token-2022`);
    }

    const decodedToken = decodeToken(maybeAccount);
    const extension = getExtensions(decodedToken.data).find(ext => ext.__kind === 'ConfidentialTransferAccount');
    if (!extension || extension.__kind !== 'ConfidentialTransferAccount') {
        return {
            tokenAccount,
            exists: true,
            configured: false,
            publicBalance: decodedToken.data.amount,
            approved: null,
            elgamalPubkey: null,
            allowConfidentialCredits: null,
            allowNonConfidentialCredits: null,
            pendingBalanceCreditCounter: null,
            maximumPendingBalanceCreditCounter: null,
        };
    }

    return {
        tokenAccount,
        exists: true,
        configured: true,
        publicBalance: decodedToken.data.amount,
        approved: extension.approved,
        elgamalPubkey: extension.elgamalPubkey,
        allowConfidentialCredits: extension.allowConfidentialCredits,
        allowNonConfidentialCredits: extension.allowNonConfidentialCredits,
        pendingBalanceCreditCounter: extension.pendingBalanceCreditCounter,
        maximumPendingBalanceCreditCounter: extension.maximumPendingBalanceCreditCounter,
    };
}

export async function getConfidentialTransferBalances(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority: ConfidentialTransferMessageSigner<string>;
    tokenAccount?: Address;
}): Promise<ConfidentialTransferBalances> {
    const zk = await loadZkSdk();
    const tokenAccount = await getResolvedTokenAccountAddress(input);
    const decodedToken = await fetchDecodedTokenAccount(input.rpc, tokenAccount);
    const confidentialAccount = getConfidentialTransferAccountExtension(getExtensions(decodedToken.data));
    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount,
        zk,
    });
    const pendingLow = elgamalKeypair.secret().decrypt(ciphertextFromBytes(zk, confidentialAccount.pendingBalanceLow));
    const pendingHigh = elgamalKeypair
        .secret()
        .decrypt(ciphertextFromBytes(zk, confidentialAccount.pendingBalanceHigh));

    return {
        tokenAccount,
        publicBalance: decodedToken.data.amount,
        pendingBalance: pendingLow + (pendingHigh << TRANSFER_AMOUNT_LO_BITS),
        availableBalance: aesKey.decrypt(aeCiphertextFromBytes(zk, confidentialAccount.decryptableAvailableBalance)),
        approved: confidentialAccount.approved,
        allowConfidentialCredits: confidentialAccount.allowConfidentialCredits,
        allowNonConfidentialCredits: confidentialAccount.allowNonConfidentialCredits,
        pendingBalanceCreditCounter: confidentialAccount.pendingBalanceCreditCounter,
        maximumPendingBalanceCreditCounter: confidentialAccount.maximumPendingBalanceCreditCounter,
    };
}
