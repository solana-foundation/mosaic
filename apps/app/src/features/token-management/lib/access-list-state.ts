import { getAddressDecoder, type Address } from '@solana/kit';

/**
 * What the sRFC-37 access-list tab knows about a mint's list, read from chain.
 *
 * The mode comes from the list attached to the mint, never from a list derived
 * from the connected wallet, so every viewer sees the same mode and members.
 * Only the list authority can change it: `canManage` says whether that is the
 * connected wallet.
 */
export type AccessListMode = 'allowlist' | 'blocklist';

export type AccessListState =
    | { status: 'loading' }
    | { status: 'not-initialised' }
    | { status: 'unsupported'; reason: string }
    | { status: 'error'; message: string }
    | {
          status: 'ready';
          mode: AccessListMode;
          listConfig: Address;
          authority: Address;
          wallets: Address[];
          canManage: boolean;
      };

export type ReadyAccessListState = Extract<AccessListState, { status: 'ready' }>;

/** The list config account as `fetchMaybeListConfig` returns it, reduced to what the resolver reads. */
export type ListConfigAccount =
    | { exists: false; address: Address }
    | {
          exists: true;
          address: Address;
          programAddress: Address;
          data: { mode: number; authority: Address };
      };

// ExtraAccountMetaList layout: 8-byte TLV discriminator, u32 length, u32 entry
// count, then fixed-size ExtraAccountMeta entries (1-byte discriminator,
// 32-byte address config, is_signer, is_writable).
const HEADER_SIZE = 16;
const ENTRY_SIZE = 35;
const FIXED_ADDRESS_DISCRIMINATOR = 0;

/**
 * Returns the list configs a mint's thaw extra-account-metas account points at.
 *
 * The ABL program writes one fixed-address entry (discriminator 0) per list
 * config attached to the mint; the wallet-entry PDA seeds that follow are
 * discriminator-1 entries and are skipped.
 *
 * @throws if the TLV length does not match the entry count or the data is truncated
 */
export function listConfigsFromExtraMetas(data: Uint8Array): Address[] {
    if (data.length < HEADER_SIZE) {
        throw new Error(`Extra account metas are ${data.length} bytes, shorter than the ${HEADER_SIZE}-byte header`);
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const length = view.getUint32(8, true);
    const count = view.getUint32(12, true);
    if (length !== count * ENTRY_SIZE + 4) {
        throw new Error(`Extra account metas length ${length} does not match ${count} entries`);
    }
    if (data.length < HEADER_SIZE + count * ENTRY_SIZE) {
        throw new Error(`Extra account metas are truncated: ${count} entries need more than ${data.length} bytes`);
    }

    const addressDecoder = getAddressDecoder();
    const listConfigs: Address[] = [];
    for (let i = 0; i < count; i++) {
        const offset = HEADER_SIZE + i * ENTRY_SIZE;
        if (data[offset] === FIXED_ADDRESS_DISCRIMINATOR) {
            listConfigs.push(addressDecoder.decode(data, offset + 1));
        }
    }
    return listConfigs;
}

/** Maps an ABL `Mode` (Allow = 0, Unused = 1, Block = 2) to a list type, or null when it is neither. */
export function listTypeFromMode(mode: number): AccessListMode | null {
    if (mode === 0) return 'allowlist';
    if (mode === 2) return 'blocklist';
    return null;
}

/**
 * The single list config attached to a mint, or null when there isn't exactly
 * one readable entry. The loader uses it to decide what to fetch next; the
 * resolver reports why when it is null.
 */
export function attachedListConfig(extraMetas: Uint8Array | null): Address | null {
    if (!extraMetas) return null;
    try {
        const listConfigs = listConfigsFromExtraMetas(extraMetas);
        return listConfigs.length === 1 ? listConfigs[0] : null;
    } catch {
        return null;
    }
}

export function shortAddress(address: string): string {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Turns what was read from chain into the tab's state.
 *
 * @param input.extraMetas - data of the mint's thaw extra-metas account under the ABL program, null if it doesn't exist
 * @param input.listConfigAccount - the attached list config, null when there isn't exactly one to fetch
 * @param input.wallets - the list's members
 * @param input.connectedWallet - the wallet viewing the page, if any
 * @param input.derivedListConfigForWallet - the list config the SDK's write helpers derive from that wallet
 * @param input.ablProgramId - the program that must own the list config
 */
export function resolveAccessListState(input: {
    extraMetas: Uint8Array | null;
    listConfigAccount: ListConfigAccount | null;
    wallets: Address[];
    connectedWallet: Address | null;
    derivedListConfigForWallet: Address | null;
    ablProgramId: Address;
}): AccessListState {
    if (!input.extraMetas) return { status: 'not-initialised' };

    let listConfigs: Address[];
    try {
        listConfigs = listConfigsFromExtraMetas(input.extraMetas);
    } catch (error) {
        return {
            status: 'unsupported',
            reason: `its extra account metas can't be parsed (${error instanceof Error ? error.message : String(error)})`,
        };
    }
    if (listConfigs.length === 0) return { status: 'not-initialised' };
    if (listConfigs.length > 1) {
        return {
            status: 'unsupported',
            reason: `${listConfigs.length} lists are attached to it, and Mosaic manages one`,
        };
    }

    const listConfig = listConfigs[0];
    const account = input.listConfigAccount;
    if (!account || account.address !== listConfig || !account.exists) {
        return { status: 'unsupported', reason: `its list config ${shortAddress(listConfig)} doesn't exist` };
    }
    if (account.programAddress !== input.ablProgramId) {
        return {
            status: 'unsupported',
            reason: `its list config ${shortAddress(listConfig)} isn't owned by the allowlist/blocklist program`,
        };
    }
    const mode = listTypeFromMode(account.data.mode);
    if (!mode) {
        return {
            status: 'unsupported',
            reason: `its list mode ${account.data.mode} is neither allowlist nor blocklist`,
        };
    }

    const authority = account.data.authority;
    // The SDK's write helpers re-derive the list config from the signer, so the
    // wallet can only change this list if that derivation lands on it too.
    const canManage =
        input.connectedWallet !== null &&
        authority === input.connectedWallet &&
        listConfig === input.derivedListConfigForWallet;

    return { status: 'ready', mode, listConfig, authority, wallets: input.wallets, canManage };
}
