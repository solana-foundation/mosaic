import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { getBase64Decoder } from '@solana/kit';
import { createMockRpc } from '../../__tests__/test-utils';
import { fetchConfidentialAccountState, type ConfidentialAccountState } from '../../confidential/account-state';
import { inspectConfidentialAccount } from '../inspect-confidential-account';

jest.mock('../../confidential/account-state', () => ({
    fetchConfidentialAccountState: jest.fn(),
}));

const TOKEN_ACCOUNT = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const ELGAMAL_PUBKEY = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;
const base64 = getBase64Decoder();

const baseState = (): ConfidentialAccountState => ({
    tokenAccount: TOKEN_ACCOUNT,
    approved: true,
    elgamalPubkey: ELGAMAL_PUBKEY,
    allowConfidentialCredits: true,
    allowNonConfidentialCredits: false,
    pendingBalanceCreditCounter: 1n,
    maximumPendingBalanceCreditCounter: 65536n,
    expectedPendingBalanceCreditCounter: 0n,
    actualPendingBalanceCreditCounter: 1n,
    ciphertexts: {
        pendingBalanceLow: new Uint8Array(64).fill(1),
        pendingBalanceHigh: new Uint8Array(64).fill(2),
        availableBalance: new Uint8Array(64).fill(3),
        decryptableAvailableBalance: new Uint8Array(36).fill(4),
    },
});

describe('inspectConfidentialAccount', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    it('returns null when the account has no confidential state', async () => {
        (fetchConfidentialAccountState as jest.Mock).mockResolvedValue(null);
        expect(await inspectConfidentialAccount(rpc, TOKEN_ACCOUNT)).toBeNull();
    });

    it('base64-encodes ciphertexts and copies flags/counters', async () => {
        (fetchConfidentialAccountState as jest.Mock).mockResolvedValue(baseState());

        const info = await inspectConfidentialAccount(rpc, TOKEN_ACCOUNT);

        expect(info).not.toBeNull();
        expect(info!.approved).toBe(true);
        expect(info!.elgamalPubkey).toBe(ELGAMAL_PUBKEY);
        expect(info!.maximumPendingBalanceCreditCounter).toBe(65536n);
        expect(info!.ciphertexts.availableBalance).toBe(base64.decode(new Uint8Array(64).fill(3)));
        expect(info!.ciphertexts.decryptableAvailableBalance).toBe(base64.decode(new Uint8Array(36).fill(4)));
        expect(info!.decrypted).toBeUndefined();
    });

    it('passes keys through and surfaces decrypted balances', async () => {
        (fetchConfidentialAccountState as jest.Mock).mockResolvedValue({
            ...baseState(),
            decrypted: { availableBalance: 500n, pendingBalance: 12n },
        });

        const keys = { elgamal: {}, aes: {} } as never;
        const info = await inspectConfidentialAccount(rpc, TOKEN_ACCOUNT, keys, { decryptPendingBalance: true });

        expect(info!.decrypted).toEqual({ availableBalance: 500n, pendingBalance: 12n });
        expect(fetchConfidentialAccountState).toHaveBeenCalledWith(rpc, TOKEN_ACCOUNT, {
            commitment: undefined,
            keys,
            decryptPendingBalance: true,
        });
    });
});
