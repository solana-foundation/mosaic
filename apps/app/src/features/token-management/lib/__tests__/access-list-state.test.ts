import { getAddressEncoder, type Address } from '@solana/kit';
import {
    attachedListConfig,
    listConfigsFromExtraMetas,
    listTypeFromMode,
    resolveAccessListState,
    type ListConfigAccount,
} from '../access-list-state';

const ABL_PROGRAM_ID = 'GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz' as Address;

// Devnet allowlist fixture 4BJ5GDrV2oAeotYESPXNDc3CnoTC6y5WX8epQPzf7F5T: its thaw extra-metas account
// D1D2PELLC2cgRySiPVn3ox648ijtwNDdiWW9zj5pv6Dn (86 bytes, 2 entries: the list config, then the
// wallet-entry PDA seeds).
const DEVNET_EXTRA_METAS = new Uint8Array(
    Buffer.from(
        'CK+pgYlKPfFKAAAAAgAAAACpbzmajUYVVjc0bbObN103XAawBSDerFBqmY0DAUMWiAAAAQEMd2FsbGV0X2VudHJ5AwYEASAgAAAAAAAAAAAAAAAAAAA=',
        'base64',
    ),
);
const DEVNET_LIST_CONFIG = 'CQQGbYLoRPHuzJQoqNt6FoDfcKmXTpnZ5E7Pz663emod' as Address;
const DEVNET_LIST_AUTHORITY = '9DMWvjE7svY2VCmpkdn5fHS7aG4msACtnMUwnhnB82wF' as Address;
// QA wallet B, which holds no authority on the fixture.
const NON_CREATOR = 'BrakVqv3Vd4R7dCYWfZTdJqTydoN6t8Rm6gqCYfchwif' as Address;
// The devnet blocklist fixture G73U…62UU's list config.
const OTHER_LIST_CONFIG = 'HZZBPd9a7S6LB3gSDnACuoy4zoL2kHAfZGPSqWFgHLsX' as Address;

/** Builds an ExtraAccountMetaList with one fixed-address entry per address, then any raw entries. */
function extraMetas(addresses: Address[], rawEntries: Uint8Array[] = [], declaredLength?: number): Uint8Array {
    const entries = [
        ...addresses.map(address => {
            const entry = new Uint8Array(35);
            entry.set(getAddressEncoder().encode(address), 1);
            return entry;
        }),
        ...rawEntries,
    ];
    const data = new Uint8Array(16 + entries.length * 35);
    const view = new DataView(data.buffer);
    view.setUint32(8, declaredLength ?? entries.length * 35 + 4, true);
    view.setUint32(12, entries.length, true);
    entries.forEach((entry, i) => data.set(entry, 16 + i * 35));
    return data;
}

function listConfigAccount(mode: number, overrides: Partial<{ programAddress: Address }> = {}): ListConfigAccount {
    return {
        exists: true,
        address: DEVNET_LIST_CONFIG,
        programAddress: overrides.programAddress ?? ABL_PROGRAM_ID,
        data: { mode, authority: DEVNET_LIST_AUTHORITY },
    };
}

const wallets = [NON_CREATOR];

function resolve(input: Partial<Parameters<typeof resolveAccessListState>[0]>) {
    return resolveAccessListState({
        extraMetas: DEVNET_EXTRA_METAS,
        listConfigAccount: listConfigAccount(0),
        wallets,
        connectedWallet: NON_CREATOR,
        derivedListConfigForWallet: OTHER_LIST_CONFIG,
        ablProgramId: ABL_PROGRAM_ID,
        ...input,
    });
}

describe('listConfigsFromExtraMetas', () => {
    it('reads the list config from the devnet allowlist fixture and skips the wallet-entry seeds', () => {
        expect(DEVNET_EXTRA_METAS.length).toBe(86);
        expect(listConfigsFromExtraMetas(DEVNET_EXTRA_METAS)).toEqual([DEVNET_LIST_CONFIG]);
    });

    it('returns no list configs for zero entries', () => {
        expect(listConfigsFromExtraMetas(extraMetas([]))).toEqual([]);
    });

    it('returns every fixed-address entry', () => {
        expect(listConfigsFromExtraMetas(extraMetas([DEVNET_LIST_CONFIG, OTHER_LIST_CONFIG]))).toEqual([
            DEVNET_LIST_CONFIG,
            OTHER_LIST_CONFIG,
        ]);
    });

    it('throws when the TLV length does not match the entry count', () => {
        expect(() => listConfigsFromExtraMetas(extraMetas([DEVNET_LIST_CONFIG], [], 70))).toThrow(
            /does not match 1 entries/,
        );
    });

    it('throws when the data is shorter than the entries it declares', () => {
        expect(() => listConfigsFromExtraMetas(DEVNET_EXTRA_METAS.slice(0, 60))).toThrow(/truncated/);
        expect(() => listConfigsFromExtraMetas(new Uint8Array(8))).toThrow(/header/);
    });
});

describe('listTypeFromMode', () => {
    it.each([
        [0, 'allowlist'],
        [2, 'blocklist'],
        [1, null],
        [7, null],
    ])('maps mode %i to %p', (mode, expected) => {
        expect(listTypeFromMode(mode)).toBe(expected);
    });
});

describe('attachedListConfig', () => {
    it('returns the single attached list config', () => {
        expect(attachedListConfig(DEVNET_EXTRA_METAS)).toBe(DEVNET_LIST_CONFIG);
    });

    it('returns null when there is nothing to fetch', () => {
        expect(attachedListConfig(null)).toBeNull();
        expect(attachedListConfig(extraMetas([]))).toBeNull();
        expect(attachedListConfig(extraMetas([DEVNET_LIST_CONFIG, OTHER_LIST_CONFIG]))).toBeNull();
        expect(attachedListConfig(new Uint8Array(4))).toBeNull();
    });
});

describe('resolveAccessListState', () => {
    it('is not-initialised when the extra-metas account is missing', () => {
        expect(resolve({ extraMetas: null, listConfigAccount: null })).toEqual({ status: 'not-initialised' });
    });

    it('is not-initialised when no list is attached', () => {
        expect(resolve({ extraMetas: extraMetas([]), listConfigAccount: null })).toEqual({
            status: 'not-initialised',
        });
    });

    it('is unsupported when more than one list is attached', () => {
        const state = resolve({
            extraMetas: extraMetas([DEVNET_LIST_CONFIG, OTHER_LIST_CONFIG]),
            listConfigAccount: null,
        });
        expect(state).toEqual({ status: 'unsupported', reason: expect.stringContaining('2 lists') });
    });

    it('is unsupported when the extra metas are malformed', () => {
        const state = resolve({ extraMetas: extraMetas([DEVNET_LIST_CONFIG], [], 70), listConfigAccount: null });
        expect(state.status).toBe('unsupported');
    });

    it('is unsupported when the list config does not exist', () => {
        const state = resolve({ listConfigAccount: { exists: false, address: DEVNET_LIST_CONFIG } });
        expect(state).toEqual({ status: 'unsupported', reason: expect.stringContaining("doesn't exist") });
    });

    it('is unsupported when the list config is not owned by the ABL program', () => {
        const state = resolve({
            listConfigAccount: listConfigAccount(0, { programAddress: '11111111111111111111111111111111' as Address }),
        });
        expect(state).toEqual({ status: 'unsupported', reason: expect.stringContaining("isn't owned") });
    });

    it('is unsupported for the Unused mode', () => {
        const state = resolve({ listConfigAccount: listConfigAccount(1) });
        expect(state).toEqual({ status: 'unsupported', reason: expect.stringContaining('mode 1') });
    });

    it('shows a non-creator the real allowlist, read-only (HOO-953)', () => {
        expect(resolve({})).toEqual({
            status: 'ready',
            mode: 'allowlist',
            listConfig: DEVNET_LIST_CONFIG,
            authority: DEVNET_LIST_AUTHORITY,
            wallets,
            canManage: false,
        });
    });

    it('reads a blocklist mode', () => {
        expect(resolve({ listConfigAccount: listConfigAccount(2) })).toMatchObject({
            status: 'ready',
            mode: 'blocklist',
        });
    });

    it('lets the authority manage the list its signer derives', () => {
        const state = resolve({
            connectedWallet: DEVNET_LIST_AUTHORITY,
            derivedListConfigForWallet: DEVNET_LIST_CONFIG,
        });
        expect(state).toMatchObject({ status: 'ready', mode: 'allowlist', canManage: true });
    });

    it('does not let the authority manage when its signer derives a different list', () => {
        const state = resolve({
            connectedWallet: DEVNET_LIST_AUTHORITY,
            derivedListConfigForWallet: OTHER_LIST_CONFIG,
        });
        expect(state).toMatchObject({ status: 'ready', canManage: false });
    });

    it('is read-only without a connected wallet', () => {
        expect(resolve({ connectedWallet: null, derivedListConfigForWallet: null })).toMatchObject({
            status: 'ready',
            canManage: false,
        });
    });
});
