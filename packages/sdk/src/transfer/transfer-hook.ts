/**
 * Transfer hook extra account resolution (spl-transfer-hook-interface `ExtraAccountMetaList`).
 *
 * When a Token-2022 mint's TransferHook extension names a program, every transfer CPIs into that
 * program's `Execute` instruction. Token-2022 only finds the accounts for that CPI among the
 * transfer instruction's own trailing accounts, so the client must append: every extra account the
 * hook declares in its validation account (the `["extra-account-metas", mint]` PDA), then the hook
 * program, then the validation account.
 *
 * Ported from `@solana-program/token-2022` 0.18's `transferHookExtraAccountMetas` (kit v8 only; this
 * SDK is pinned to token-2022 0.10 on kit v6, which has no hook resolution). The exported names and
 * shapes follow that module, so moving to token-2022 >= 0.18 is a matter of swapping imports.
 * Semantics follow the on-chain `spl-tlv-account-resolution` crate and the legacy
 * `@solana/spl-token` `addExtraAccountMetasForExecute`.
 */
import {
    AccountRole,
    type AccountMeta,
    type Address,
    type GetAccountInfoApi,
    type Instruction,
    type ReadonlyUint8Array,
    type Rpc,
    type Commitment,
    type MaybeEncodedAccount,
    downgradeRoleToNonSigner,
    downgradeRoleToReadonly,
    fetchEncodedAccount,
    getAddressDecoder,
    getAddressEncoder,
    getProgramDerivedAddress,
    getU64Encoder,
    isSignerRole,
    isWritableRole,
    mergeRoles,
} from '@solana/kit';

/** Seed of the validation account that stores a mint's extra account metas, under the hook program. */
export const EXTRA_ACCOUNT_METAS_SEED = 'extra-account-metas';

/** First 8 bytes of `sha256("spl-transfer-hook-interface:execute")`. Also the TLV type of the metas list. */
export const EXECUTE_INSTRUCTION_DISCRIMINATOR = new Uint8Array([105, 37, 101, 197, 75, 251, 102, 26]);

const ADDRESS_LENGTH = 32;
const ADDRESS_CONFIG_SIZE = 32;
/** Packed size of one `ExtraAccountMeta`: discriminator + address config + is_signer + is_writable. */
const EXTRA_ACCOUNT_META_SIZE = 1 + ADDRESS_CONFIG_SIZE + 1 + 1;
const TLV_HEADER_SIZE = 8 + 4;
const ACCOUNT_PDA_DISCRIMINATOR_OFFSET = 1 << 7;

/** One packed seed of a PDA-configured extra account. */
export type ExtraAccountMetaSeed =
    | { __kind: 'Literal'; bytes: ReadonlyUint8Array }
    | { __kind: 'InstructionData'; index: number; length: number }
    | { __kind: 'AccountKey'; index: number }
    | { __kind: 'AccountData'; accountIndex: number; dataIndex: number; length: number };

/** Where a `PubkeyData`-configured extra account reads its 32-byte address from. */
export type ExtraAccountMetaPubkeyData =
    | { __kind: 'InstructionData'; index: number }
    | { __kind: 'AccountData'; accountIndex: number; dataIndex: number };

/**
 * How an extra account's address is derived:
 * - `Literal`: a fixed address.
 * - `PubkeyData`: read from the instruction data or a previous account's data.
 * - `ProgramPda`: a PDA of the hook program.
 * - `AccountPda`: a PDA of the program at `accountIndex` among the previous accounts.
 */
export type ExtraAccountMetaConfig =
    | { __kind: 'Literal'; address: Address }
    | { __kind: 'PubkeyData'; pubkeyData: ExtraAccountMetaPubkeyData }
    | { __kind: 'ProgramPda'; seeds: ExtraAccountMetaSeed[] }
    | { __kind: 'AccountPda'; accountIndex: number; seeds: ExtraAccountMetaSeed[] };

/** An extra account as declared in a hook's validation account. */
export type ExtraAccountMeta = {
    config: ExtraAccountMetaConfig;
    isSigner: boolean;
    isWritable: boolean;
};

/** Finds the validation account (`["extra-account-metas", mint]`) of a mint under its hook program. */
export async function findExtraAccountMetaListPda(seeds: { mint: Address }, config: { programAddress: Address }) {
    return await getProgramDerivedAddress({
        programAddress: config.programAddress,
        seeds: [EXTRA_ACCOUNT_METAS_SEED, getAddressEncoder().encode(seeds.mint)],
    });
}

// ---------------------------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------------------------

function invalid(message: string): Error {
    return new Error(`Invalid transfer hook extra account metas: ${message}`);
}

/** Returns `value` if it fits the one-byte field it is encoded into, so it never wraps silently. */
function u8(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw invalid(`${field} must be an integer in 0..255, got ${value}`);
    }
    return value;
}

function readU32(bytes: ReadonlyUint8Array, offset: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function bytesEqual(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean {
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** Decodes a packed seed list; it ends at the first `0` (uninitialized) discriminator or the end of the config. */
export function decodeExtraAccountMetaSeeds(config: ReadonlyUint8Array): ExtraAccountMetaSeed[] {
    const seeds: ExtraAccountMetaSeed[] = [];
    let offset = 0;
    const need = (count: number) => {
        if (offset + count > config.length) throw invalid('seed config is truncated');
    };
    while (offset < config.length && config[offset] !== 0) {
        const discriminator = config[offset++];
        switch (discriminator) {
            case 1: {
                need(1);
                const length = config[offset++];
                need(length);
                seeds.push({ __kind: 'Literal', bytes: config.slice(offset, offset + length) });
                offset += length;
                break;
            }
            case 2:
                need(2);
                seeds.push({ __kind: 'InstructionData', index: config[offset], length: config[offset + 1] });
                offset += 2;
                break;
            case 3:
                need(1);
                seeds.push({ __kind: 'AccountKey', index: config[offset] });
                offset += 1;
                break;
            case 4:
                need(3);
                seeds.push({
                    __kind: 'AccountData',
                    accountIndex: config[offset],
                    dataIndex: config[offset + 1],
                    length: config[offset + 2],
                });
                offset += 3;
                break;
            default:
                throw invalid(`unknown seed discriminator ${discriminator}`);
        }
    }
    return seeds;
}

function decodePubkeyData(config: ReadonlyUint8Array): ExtraAccountMetaPubkeyData {
    switch (config[0]) {
        case 1:
            return { __kind: 'InstructionData', index: config[1] };
        case 2:
            return { __kind: 'AccountData', accountIndex: config[1], dataIndex: config[2] };
        default:
            throw invalid(`unknown pubkey data discriminator ${config[0]}`);
    }
}

/** Decodes one packed 35-byte `ExtraAccountMeta`. */
export function decodeExtraAccountMeta(bytes: ReadonlyUint8Array): ExtraAccountMeta {
    if (bytes.length < EXTRA_ACCOUNT_META_SIZE) throw invalid('extra account meta is truncated');
    const discriminator = bytes[0];
    const addressConfig = bytes.slice(1, 1 + ADDRESS_CONFIG_SIZE);
    const isSigner = bytes[1 + ADDRESS_CONFIG_SIZE] === 1;
    const isWritable = bytes[2 + ADDRESS_CONFIG_SIZE] === 1;

    let config: ExtraAccountMetaConfig;
    if (discriminator === 0) {
        config = { __kind: 'Literal', address: getAddressDecoder().decode(addressConfig) };
    } else if (discriminator === 1) {
        config = { __kind: 'ProgramPda', seeds: decodeExtraAccountMetaSeeds(addressConfig) };
    } else if (discriminator === 2) {
        config = { __kind: 'PubkeyData', pubkeyData: decodePubkeyData(addressConfig) };
    } else if (discriminator >= ACCOUNT_PDA_DISCRIMINATOR_OFFSET) {
        config = {
            __kind: 'AccountPda',
            accountIndex: discriminator - ACCOUNT_PDA_DISCRIMINATOR_OFFSET,
            seeds: decodeExtraAccountMetaSeeds(addressConfig),
        };
    } else {
        throw invalid(`unknown extra account meta discriminator ${discriminator}`);
    }
    return { config, isSigner, isWritable };
}

/**
 * Decodes a validation account's data: a TLV list whose `Execute` entry holds a `u32` count
 * followed by that many packed `ExtraAccountMeta`s. Entries of other types are skipped.
 */
export function decodeExtraAccountMetaList(data: ReadonlyUint8Array): ExtraAccountMeta[] {
    let offset = 0;
    while (offset + TLV_HEADER_SIZE <= data.length) {
        const type = data.slice(offset, offset + 8);
        const length = readU32(data, offset + 8);
        const valueStart = offset + TLV_HEADER_SIZE;
        if (valueStart + length > data.length) throw invalid('TLV entry runs past the end of the account');
        if (bytesEqual(type, EXECUTE_INSTRUCTION_DISCRIMINATOR)) {
            if (length < 4) throw invalid('Execute entry has no count');
            const count = readU32(data, valueStart);
            if (4 + count * EXTRA_ACCOUNT_META_SIZE > length) throw invalid('Execute entry is shorter than its count');
            const metas: ExtraAccountMeta[] = [];
            for (let i = 0; i < count; i++) {
                const start = valueStart + 4 + i * EXTRA_ACCOUNT_META_SIZE;
                metas.push(decodeExtraAccountMeta(data.slice(start, start + EXTRA_ACCOUNT_META_SIZE)));
            }
            return metas;
        }
        // An all-zero type marks uninitialized space at the end of the account.
        if (type.every(byte => byte === 0)) break;
        offset = valueStart + length;
    }
    throw invalid('no Execute entry in the validation account');
}

// ---------------------------------------------------------------------------------------------
// Encoding (for initializing a validation account)
// ---------------------------------------------------------------------------------------------

function encodeSeeds(seeds: ExtraAccountMetaSeed[]): number[] {
    const out: number[] = [];
    for (const seed of seeds) {
        switch (seed.__kind) {
            case 'Literal':
                if (seed.bytes.length > 255) throw invalid('literal seed is longer than 255 bytes');
                out.push(1, seed.bytes.length, ...seed.bytes);
                break;
            case 'InstructionData':
                out.push(
                    2,
                    u8(seed.index, 'instruction-data seed index'),
                    u8(seed.length, 'instruction-data seed length'),
                );
                break;
            case 'AccountKey':
                out.push(3, u8(seed.index, 'account-key seed index'));
                break;
            case 'AccountData':
                out.push(
                    4,
                    u8(seed.accountIndex, 'account-data seed accountIndex'),
                    u8(seed.dataIndex, 'account-data seed dataIndex'),
                    u8(seed.length, 'account-data seed length'),
                );
                break;
        }
    }
    return out;
}

/** Encodes one `ExtraAccountMeta` into its packed 35-byte form. */
export function encodeExtraAccountMeta(meta: ExtraAccountMeta): Uint8Array {
    const { config } = meta;
    let discriminator: number;
    let addressConfig: ArrayLike<number>;
    switch (config.__kind) {
        case 'Literal':
            discriminator = 0;
            addressConfig = getAddressEncoder().encode(config.address);
            break;
        case 'ProgramPda':
            discriminator = 1;
            addressConfig = encodeSeeds(config.seeds);
            break;
        case 'PubkeyData':
            discriminator = 2;
            addressConfig =
                config.pubkeyData.__kind === 'InstructionData'
                    ? [1, u8(config.pubkeyData.index, 'pubkey data index')]
                    : [
                          2,
                          u8(config.pubkeyData.accountIndex, 'pubkey data accountIndex'),
                          u8(config.pubkeyData.dataIndex, 'pubkey data dataIndex'),
                      ];
            break;
        case 'AccountPda':
            u8(config.accountIndex, 'PDA program accountIndex');
            if (config.accountIndex > 0xff - ACCOUNT_PDA_DISCRIMINATOR_OFFSET) throw invalid('account index too large');
            discriminator = ACCOUNT_PDA_DISCRIMINATOR_OFFSET + config.accountIndex;
            addressConfig = encodeSeeds(config.seeds);
            break;
    }
    if (addressConfig.length > ADDRESS_CONFIG_SIZE) {
        throw invalid(`address config is ${addressConfig.length} bytes, over the ${ADDRESS_CONFIG_SIZE}-byte limit`);
    }
    const bytes = new Uint8Array(EXTRA_ACCOUNT_META_SIZE);
    bytes[0] = discriminator;
    bytes.set(addressConfig, 1);
    bytes[1 + ADDRESS_CONFIG_SIZE] = meta.isSigner ? 1 : 0;
    bytes[2 + ADDRESS_CONFIG_SIZE] = meta.isWritable ? 1 : 0;
    return bytes;
}

/**
 * Encodes a list of `ExtraAccountMeta`s as a `u32` count followed by the packed entries: the
 * argument of the interface's `InitializeExtraAccountMetaList` / `UpdateExtraAccountMetaList`.
 */
export function encodeExtraAccountMetas(metas: ExtraAccountMeta[]): Uint8Array {
    const bytes = new Uint8Array(4 + metas.length * EXTRA_ACCOUNT_META_SIZE);
    new DataView(bytes.buffer).setUint32(0, metas.length, true);
    metas.forEach((meta, i) => bytes.set(encodeExtraAccountMeta(meta), 4 + i * EXTRA_ACCOUNT_META_SIZE));
    return bytes;
}

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

type AccountFetcher = (address: Address) => Promise<MaybeEncodedAccount>;

function cachedFetcher(rpc: Rpc<GetAccountInfoApi>, commitment: Commitment): AccountFetcher {
    const cache = new Map<Address, Promise<MaybeEncodedAccount>>();
    return address => {
        let account = cache.get(address);
        if (!account) {
            account = fetchEncodedAccount(rpc, address, { commitment });
            cache.set(address, account);
        }
        return account;
    };
}

async function fetchAccountData(fetch: AccountFetcher, address: Address, purpose: string) {
    const account = await fetch(address);
    if (!account.exists) {
        throw new Error(`Transfer hook ${purpose} reads account ${address}, which does not exist`);
    }
    return account.data;
}

function previousAt(previous: Address[], index: number, purpose: string): Address {
    if (index >= previous.length) {
        throw invalid(`${purpose} references account index ${index}, but only ${previous.length} precede it`);
    }
    return previous[index];
}

/** Resolves a seed list into the byte segments a PDA is derived from. */
async function resolveSeeds(
    seeds: ExtraAccountMetaSeed[],
    previous: Address[],
    instructionData: ReadonlyUint8Array,
    fetch: AccountFetcher,
): Promise<ReadonlyUint8Array[]> {
    const resolved: ReadonlyUint8Array[] = [];
    for (const seed of seeds) {
        switch (seed.__kind) {
            case 'Literal':
                resolved.push(seed.bytes);
                break;
            case 'InstructionData':
                if (seed.index + seed.length > instructionData.length) {
                    throw invalid('instruction-data seed runs past the end of the instruction data');
                }
                resolved.push(instructionData.slice(seed.index, seed.index + seed.length));
                break;
            case 'AccountKey':
                resolved.push(getAddressEncoder().encode(previousAt(previous, seed.index, 'account-key seed')));
                break;
            case 'AccountData': {
                const target = previousAt(previous, seed.accountIndex, 'account-data seed');
                const data = await fetchAccountData(fetch, target, 'account-data seed');
                if (seed.dataIndex + seed.length > data.length) {
                    throw invalid(`account-data seed runs past the end of account ${target}'s data`);
                }
                resolved.push(data.slice(seed.dataIndex, seed.dataIndex + seed.length));
                break;
            }
        }
    }
    return resolved;
}

/** Resolves a `PubkeyData` config into the address it points to. */
async function resolvePubkeyData(
    config: ExtraAccountMetaPubkeyData,
    previous: Address[],
    instructionData: ReadonlyUint8Array,
    fetch: AccountFetcher,
): Promise<Address> {
    if (config.__kind === 'InstructionData') {
        if (config.index + ADDRESS_LENGTH > instructionData.length) {
            throw invalid('pubkey data runs past the end of the instruction data');
        }
        return getAddressDecoder().decode(instructionData, config.index);
    }
    const target = previousAt(previous, config.accountIndex, 'pubkey data');
    const data = await fetchAccountData(fetch, target, 'pubkey data');
    if (config.dataIndex + ADDRESS_LENGTH > data.length) {
        throw invalid(`pubkey data runs past the end of account ${target}'s data`);
    }
    return getAddressDecoder().decode(data, config.dataIndex);
}

/**
 * Resolves one declared extra account into its address. `previous` holds every account before it
 * in the `Execute` instruction, in order: source, mint, destination, authority, validation
 * account, then the extras resolved so far.
 */
async function resolveExtraAccountMeta(
    extraMeta: ExtraAccountMeta,
    previous: Address[],
    instructionData: ReadonlyUint8Array,
    transferHookProgramAddress: Address,
    fetch: AccountFetcher,
): Promise<Address> {
    const { config } = extraMeta;
    switch (config.__kind) {
        case 'Literal':
            return config.address;
        case 'PubkeyData':
            return await resolvePubkeyData(config.pubkeyData, previous, instructionData, fetch);
        case 'ProgramPda':
        case 'AccountPda': {
            const programAddress =
                config.__kind === 'ProgramPda'
                    ? transferHookProgramAddress
                    : previousAt(previous, config.accountIndex, 'PDA program');
            const seeds = await resolveSeeds(config.seeds, previous, instructionData, fetch);
            const [pda] = await getProgramDerivedAddress({ programAddress, seeds });
            return pda;
        }
    }
}

function roleFromFlags(isSigner: boolean, isWritable: boolean): AccountRole {
    if (isSigner) return isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
    return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

/**
 * Caps `meta`'s role at the highest role the same address already has in `existing`, so an extra
 * account that repeats an earlier one never claims more privileges than that earlier one.
 */
export function deEscalateAccountMeta(meta: AccountMeta, existing: readonly AccountMeta[]): AccountMeta {
    const matches = existing.filter(other => other.address === meta.address);
    if (matches.length === 0) return meta;
    const highest = matches.map(other => other.role).reduce(mergeRoles);
    let role = meta.role;
    if (!isSignerRole(highest) && isSignerRole(role)) role = downgradeRoleToNonSigner(role);
    if (!isWritableRole(highest) && isWritableRole(role)) role = downgradeRoleToReadonly(role);
    return { address: meta.address, role };
}

/** The `Execute` instruction data the hook is invoked with: discriminator + `u64` amount. */
export function getExecuteInstructionData(amount: bigint): Uint8Array {
    const data = new Uint8Array(16);
    data.set(EXECUTE_INSTRUCTION_DISCRIMINATOR, 0);
    data.set(getU64Encoder().encode(amount), 8);
    return data;
}

export type ResolveExtraAccountMetasForExecuteInput = {
    rpc: Rpc<GetAccountInfoApi>;
    transferHookProgramAddress: Address;
    source: Address;
    mint: Address;
    destination: Address;
    /** The transfer authority (owner or delegate) that signs the transfer. */
    owner: Address;
    amount: number | bigint;
    /** The validation account; derived with `findExtraAccountMetaListPda` if omitted. */
    validateStatePubkey?: Address;
    /** Commitment for reading the validation account and any account-data seeds. Defaults to `confirmed`. */
    commitment?: Commitment;
};

/**
 * Resolves the accounts to append to a `TransferChecked` instruction of a mint whose transfer
 * hook is `transferHookProgramAddress`: the declared extras (resolved and de-escalated), then the
 * hook program, then the validation account.
 *
 * Throws if the validation account does not exist: Token-2022 reads it on every hooked transfer
 * and rejects the transfer with `InvalidAccountData` until the hook's extra account metas are
 * initialized. (token-2022 0.18's version returns `[]` here, which fails on-chain instead.)
 */
export async function resolveExtraAccountMetasForExecute(
    input: ResolveExtraAccountMetasForExecuteInput,
): Promise<AccountMeta[]> {
    const { transferHookProgramAddress: programAddress } = input;
    const fetch = cachedFetcher(input.rpc, input.commitment ?? 'confirmed');
    const validationAccount =
        input.validateStatePubkey ?? (await findExtraAccountMetaListPda({ mint: input.mint }, { programAddress }))[0];

    const validationState = await fetch(validationAccount);
    if (!validationState.exists) {
        throw new Error(
            `Mint ${input.mint} has transfer hook program ${programAddress}, but its extra account metas ` +
                `account ${validationAccount} is not initialized. Transfers of this mint fail until the hook ` +
                `program initializes it.`,
        );
    }

    const declared = decodeExtraAccountMetaList(validationState.data);
    const instructionData = getExecuteInstructionData(BigInt(input.amount));
    // Token-2022 hands the base accounts to the hook read-only, so an extra repeating one of them
    // is de-escalated to read-only too.
    const baseMetas: AccountMeta[] = [input.source, input.mint, input.destination, input.owner, validationAccount].map(
        address => ({ address, role: AccountRole.READONLY }),
    );
    const previous = baseMetas.map(meta => meta.address);
    const extras: AccountMeta[] = [];
    for (const extraMeta of declared) {
        const address = await resolveExtraAccountMeta(extraMeta, previous, instructionData, programAddress, fetch);
        const role = roleFromFlags(extraMeta.isSigner, extraMeta.isWritable);
        extras.push(deEscalateAccountMeta({ address, role }, [...baseMetas, ...extras]));
        previous.push(address);
    }
    return [
        ...extras,
        { address: programAddress, role: AccountRole.READONLY },
        { address: validationAccount, role: AccountRole.READONLY },
    ];
}

/**
 * Reads the active transfer hook program id from a mint's `jsonParsed` extensions, as returned by
 * `getMintDetails`. Returns `null` when the mint has no TransferHook extension or it is inactive.
 */
export function getTransferHookProgramId(
    extensions: ReadonlyArray<{ extension: string; state?: Record<string, unknown> }>,
): Address | null {
    const hook = extensions.find(ext => ext.extension === 'transferHook');
    const programId = hook?.state?.programId;
    return typeof programId === 'string' && programId.length > 0 ? (programId as Address) : null;
}

/**
 * Appends the transfer hook accounts to a `TransferChecked` instruction when the mint's hook is
 * active. With `transferHookProgramAddress` null the instruction is returned unchanged and no RPC
 * call is made.
 */
export async function withTransferHookAccounts<TInstruction extends Instruction>(
    instruction: TInstruction,
    input: Omit<ResolveExtraAccountMetasForExecuteInput, 'transferHookProgramAddress'> & {
        transferHookProgramAddress: Address | null;
    },
): Promise<TInstruction> {
    const { transferHookProgramAddress } = input;
    if (!transferHookProgramAddress) return instruction;
    const hookAccounts = await resolveExtraAccountMetasForExecute({ ...input, transferHookProgramAddress });
    return { ...instruction, accounts: [...(instruction.accounts ?? []), ...hookAccounts] };
}
