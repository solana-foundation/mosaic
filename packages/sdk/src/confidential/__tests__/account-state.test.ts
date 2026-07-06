import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { fetchEncodedAccount } from '@solana/kit';
import { decodeToken, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { ElGamalKeypair, AeKey } from '@solana/zk-sdk/node';
import { createMockRpc } from '../../__tests__/test-utils';
import {
    fetchConfidentialAccountState,
    decryptConfidentialBalances,
    type ConfidentialAccountState,
} from '../account-state';
import type { ConfidentialKeys } from '../keys';

jest.mock('@solana/kit', () => ({
    ...jest.requireActual('@solana/kit'),
    fetchEncodedAccount: jest.fn(),
}));

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    decodeToken: jest.fn(),
}));

const TOKEN_ACCOUNT = 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v' as Address;
const ELGAMAL_PUBKEY = 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj' as Address;

// Real WASM keys + ciphertexts so the decrypt path is exercised end to end.
const elgamal = ElGamalKeypair.fromSeed(new Uint8Array(32).fill(3));
const aes = AeKey.fromSeed(new Uint8Array(32).fill(4));
const keys: ConfidentialKeys = { elgamal, aes };

const u8 = (bytes: Uint8Array | Readonly<Uint8Array>) => new Uint8Array(bytes);

function buildExtension(overrides: Record<string, unknown> = {}) {
    return {
        __kind: 'ConfidentialTransferAccount',
        approved: true,
        elgamalPubkey: ELGAMAL_PUBKEY,
        pendingBalanceLow: u8(elgamal.pubkey().encryptU64(5n).toBytes()),
        pendingBalanceHigh: u8(elgamal.pubkey().encryptU64(3n).toBytes()),
        availableBalance: u8(elgamal.pubkey().encryptU64(1000n).toBytes()),
        decryptableAvailableBalance: u8(aes.encrypt(1000n).toBytes()),
        allowConfidentialCredits: true,
        allowNonConfidentialCredits: false,
        pendingBalanceCreditCounter: 2n,
        maximumPendingBalanceCreditCounter: 65536n,
        expectedPendingBalanceCreditCounter: 1n,
        actualPendingBalanceCreditCounter: 2n,
        ...overrides,
    };
}

const mockEncodedAccount = () =>
    (fetchEncodedAccount as jest.Mock).mockResolvedValue({
        exists: true,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    });

const mockDecodedExtensions = (value: unknown[] | null) =>
    (decodeToken as jest.Mock).mockReturnValue({
        data: { extensions: value === null ? { __option: 'None' } : { __option: 'Some', value } },
    });

describe('fetchConfidentialAccountState', () => {
    let rpc: Rpc<SolanaRpcApi>;

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
    });

    it('returns null when the account does not exist', async () => {
        (fetchEncodedAccount as jest.Mock).mockResolvedValue({ exists: false });
        expect(await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT)).toBeNull();
        expect(decodeToken).not.toHaveBeenCalled();
    });

    it('returns null when the account is not owned by Token-2022', async () => {
        (fetchEncodedAccount as jest.Mock).mockResolvedValue({
            exists: true,
            programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address,
        });
        expect(await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT)).toBeNull();
    });

    it('returns null when there is no ConfidentialTransferAccount extension', async () => {
        mockEncodedAccount();
        mockDecodedExtensions([{ __kind: 'ImmutableOwner' }]);
        expect(await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT)).toBeNull();
    });

    it('decodes the extension fields (no keys → no decrypted balances)', async () => {
        mockEncodedAccount();
        mockDecodedExtensions([{ __kind: 'ImmutableOwner' }, buildExtension()]);

        const state = (await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT)) as ConfidentialAccountState;

        expect(state).not.toBeNull();
        expect(state.tokenAccount).toBe(TOKEN_ACCOUNT);
        expect(state.approved).toBe(true);
        expect(state.elgamalPubkey).toBe(ELGAMAL_PUBKEY);
        expect(state.allowConfidentialCredits).toBe(true);
        expect(state.allowNonConfidentialCredits).toBe(false);
        expect(state.pendingBalanceCreditCounter).toBe(2n);
        expect(state.ciphertexts.decryptableAvailableBalance).toHaveLength(36);
        expect(state.decrypted).toBeUndefined();
    });

    it('decrypts the available balance (AES) when keys are supplied', async () => {
        mockEncodedAccount();
        mockDecodedExtensions([buildExtension()]);

        const state = (await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT, { keys })) as ConfidentialAccountState;

        expect(state.decrypted?.availableBalance).toBe(1000n);
        // pending is not decrypted unless explicitly requested
        expect(state.decrypted?.pendingBalance).toBeUndefined();
    });

    it('decrypts the pending balance as low + (high << 16) when requested', async () => {
        mockEncodedAccount();
        mockDecodedExtensions([buildExtension()]);

        const state = (await fetchConfidentialAccountState(rpc, TOKEN_ACCOUNT, {
            keys,
            decryptPendingBalance: true,
        })) as ConfidentialAccountState;

        expect(state.decrypted?.pendingBalance).toBe(5n + (3n << 16n));
    });
});

describe('decryptConfidentialBalances', () => {
    it('decrypts available always and pending only on request', () => {
        const state: ConfidentialAccountState = {
            tokenAccount: TOKEN_ACCOUNT,
            approved: true,
            elgamalPubkey: ELGAMAL_PUBKEY,
            allowConfidentialCredits: true,
            allowNonConfidentialCredits: true,
            pendingBalanceCreditCounter: 0n,
            maximumPendingBalanceCreditCounter: 0n,
            expectedPendingBalanceCreditCounter: 0n,
            actualPendingBalanceCreditCounter: 0n,
            ciphertexts: {
                pendingBalanceLow: u8(elgamal.pubkey().encryptU64(7n).toBytes()),
                pendingBalanceHigh: u8(elgamal.pubkey().encryptU64(0n).toBytes()),
                availableBalance: u8(elgamal.pubkey().encryptU64(42n).toBytes()),
                decryptableAvailableBalance: u8(aes.encrypt(42n).toBytes()),
            },
        };

        expect(decryptConfidentialBalances(state, keys)).toEqual({ availableBalance: 42n });
        expect(decryptConfidentialBalances(state, keys, { decryptPendingBalance: true })).toEqual({
            availableBalance: 42n,
            pendingBalance: 7n,
        });
    });
});
