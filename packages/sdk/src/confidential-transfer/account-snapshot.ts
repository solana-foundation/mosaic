import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import type { ConfidentialTransferMessageSigner } from './authority';
import { getConfidentialTransferAccountStatus, getConfidentialTransferBalances } from './state';
import type { ConfidentialTransferAccountStatus, ConfidentialTransferBalances } from './types';

export type ConfidentialTransferAccountLifecycle = 'missing' | 'unconfigured' | 'configured' | 'approved';

export type ConfidentialTransferAccountSnapshot = {
    tokenAccount: Address;
    lifecycle: ConfidentialTransferAccountLifecycle;
    status: ConfidentialTransferAccountStatus;
    balances: ConfidentialTransferBalances | null;
    creditSettings: {
        allowConfidentialCredits: boolean | null;
        allowNonConfidentialCredits: boolean | null;
        pendingBalanceCreditCounter: bigint | null;
        maximumPendingBalanceCreditCounter: bigint | null;
    };
    keyDerivation: {
        messageSigningRequired: boolean;
        messageSigningAvailable: boolean;
        canReadEncryptedBalances: boolean;
    };
    availableActions: {
        configureAccount: boolean;
        approveAccount: boolean;
        deposit: boolean;
        applyPendingBalance: boolean;
        withdraw: boolean;
        transfer: boolean;
        emptyAccount: boolean;
        setConfidentialCredits: boolean;
        setNonConfidentialCredits: boolean;
    };
};

export function createConfidentialTransferAccountSnapshot(input: {
    status: ConfidentialTransferAccountStatus;
    balances?: ConfidentialTransferBalances | null;
    messageSigningAvailable?: boolean;
}): ConfidentialTransferAccountSnapshot {
    const balances = input.balances ?? null;
    const messageSigningAvailable = input.messageSigningAvailable ?? Boolean(balances);
    const lifecycle = getLifecycle(input.status);
    const configured = input.status.configured;
    const approved = input.status.approved === true;
    const canUsePrivateBalance = configured && approved && messageSigningAvailable;
    const pendingBalance = balances?.pendingBalance ?? 0n;
    const availableBalance = balances?.availableBalance ?? 0n;

    return {
        tokenAccount: input.status.tokenAccount,
        lifecycle,
        status: input.status,
        balances,
        creditSettings: {
            allowConfidentialCredits: input.status.allowConfidentialCredits,
            allowNonConfidentialCredits: input.status.allowNonConfidentialCredits,
            pendingBalanceCreditCounter: input.status.pendingBalanceCreditCounter,
            maximumPendingBalanceCreditCounter: input.status.maximumPendingBalanceCreditCounter,
        },
        keyDerivation: {
            messageSigningRequired: configured,
            messageSigningAvailable,
            canReadEncryptedBalances: configured && messageSigningAvailable && Boolean(balances),
        },
        availableActions: {
            configureAccount: !configured,
            approveAccount: configured && input.status.approved === false,
            deposit: configured && approved,
            applyPendingBalance: canUsePrivateBalance && pendingBalance > 0n,
            withdraw: canUsePrivateBalance && availableBalance > 0n,
            transfer: canUsePrivateBalance && availableBalance > 0n,
            emptyAccount:
                configured &&
                messageSigningAvailable &&
                input.status.publicBalance === 0n &&
                pendingBalance === 0n &&
                availableBalance === 0n,
            setConfidentialCredits: configured,
            setNonConfidentialCredits: configured,
        },
    };
}

export async function getConfidentialTransferAccountSnapshot(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    owner: Address;
    authority?: ConfidentialTransferMessageSigner<string>;
    tokenAccount?: Address;
}): Promise<ConfidentialTransferAccountSnapshot> {
    const status = await getConfidentialTransferAccountStatus(input);
    const balances =
        status.configured && input.authority
            ? await getConfidentialTransferBalances({
                  ...input,
                  authority: input.authority,
                  tokenAccount: status.tokenAccount,
              })
            : null;

    return createConfidentialTransferAccountSnapshot({
        status,
        balances,
        messageSigningAvailable: Boolean(input.authority),
    });
}

function getLifecycle(status: ConfidentialTransferAccountStatus): ConfidentialTransferAccountLifecycle {
    if (!status.exists) {
        return 'missing';
    }
    if (!status.configured) {
        return 'unconfigured';
    }
    return status.approved === true ? 'approved' : 'configured';
}
