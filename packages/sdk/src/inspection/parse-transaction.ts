import {
    AccountRole,
    decompileTransactionMessage,
    decompileTransactionMessageFetchingLookupTables,
    getBase58Encoder,
    getBase64Encoder,
    getCompiledTransactionMessageDecoder,
    getTransactionDecoder,
    type AccountLookupMeta,
    type AccountMeta,
    type Address,
    type AddressesByLookupTableAddress,
    type GetMultipleAccountsApi,
    type Instruction,
    type InstructionWithAccounts,
    type InstructionWithData,
    type ReadonlyUint8Array,
    type Rpc,
    type SolanaRpcApi,
} from '@solana/kit';
import {
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    AssociatedTokenInstruction,
    identifyAssociatedTokenInstruction,
    identifyToken2022Instruction,
    parseAssociatedTokenInstruction,
    parseToken2022Instruction,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    type ParsedAssociatedTokenInstruction,
    type ParsedToken2022Instruction,
} from '@solana-program/token-2022';
import {
    identifySystemInstruction,
    parseAllocateInstruction,
    parseAllocateWithSeedInstruction,
    parseCreateAccountInstruction,
    parseCreateAccountWithSeedInstruction,
    parseTransferSolInstruction,
    SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    type ParsedAllocateInstruction,
    type ParsedAllocateWithSeedInstruction,
    type ParsedCreateAccountInstruction,
    type ParsedCreateAccountWithSeedInstruction,
    type ParsedTransferSolInstruction,
} from '@solana-program/system';
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl/utils';

/**
 * Input form for raw transaction bytes. A bare Uint8Array is treated as the
 * decoded wire format; pass an object with explicit `format` to decode a
 * base58/base64 string without heuristics.
 */
export type RawTransactionInput = Uint8Array | { format: 'base64' | 'base58' | 'bytes'; data: string | Uint8Array };

export type TokenInstructionCategory =
    | 'mint-init'
    | 'mint-config-update'
    | 'pause'
    | 'supply'
    | 'freeze'
    | 'transfer'
    | 'delegation'
    | 'account-init'
    | 'account-lifecycle'
    | 'fee-harvest'
    | 'confidential-config'
    | 'metadata-emit'
    | 'other-token2022'
    | 'other';

export type ProgramLabel = 'token-2022' | 'system' | 'associated-token' | 'token-acl' | 'unknown';

interface ParsedInstructionBase {
    /** Position of the instruction in its enclosing list (outer or inner). */
    index: number;
    programAddress: Address;
    programLabel: ProgramLabel;
    category: TokenInstructionCategory;
    /** Resolved AccountMeta or AccountLookupMeta from kit's decompile step. */
    accounts: ReadonlyArray<AccountMeta | AccountLookupMeta>;
    rawData: ReadonlyUint8Array | undefined;
    /**
     * CPI calls emitted by this instruction during execution. Only populated by
     * {@link parseConfirmedTransaction}; pre-execution parsing has no CPI data.
     */
    innerInstructions?: ParsedTransactionInstruction[];
    /**
     * The CPI nesting depth (1 = outer instruction, 2+ = inner). Set by
     * parseConfirmedTransaction from the cluster's reported `stackHeight`.
     */
    stackHeight?: number;
}

export interface ParsedToken2022InstructionEntry extends ParsedInstructionBase {
    programLabel: 'token-2022';
    token2022: {
        name: string;
        instructionType: Token2022Instruction;
        /** Populated when the per-instruction codec successfully decoded the data. */
        parsed?: ParsedToken2022Instruction<string>;
        /** Set when codec decoding failed; identification still succeeded. */
        parseError?: string;
    };
}

export interface ParsedAssociatedTokenInstructionEntry extends ParsedInstructionBase {
    programLabel: 'associated-token';
    associatedToken: {
        name: string;
        instructionType: AssociatedTokenInstruction;
        parsed?: ParsedAssociatedTokenInstruction<string>;
        parseError?: string;
    };
}

type ParsedSystemPayload =
    | ParsedCreateAccountInstruction<string>
    | ParsedCreateAccountWithSeedInstruction<string>
    | ParsedAllocateInstruction<string>
    | ParsedAllocateWithSeedInstruction<string>
    | ParsedTransferSolInstruction<string>;

export interface ParsedSystemInstructionEntry extends ParsedInstructionBase {
    programLabel: 'system';
    system: {
        name: string;
        instructionType: SystemInstruction;
        /** Populated only for the subset of system instructions we parse. */
        parsed?: ParsedSystemPayload;
    };
}

export interface UnparsedInstructionEntry extends ParsedInstructionBase {
    programLabel: 'token-acl' | 'unknown';
}

export type ParsedTransactionInstruction =
    | ParsedToken2022InstructionEntry
    | ParsedAssociatedTokenInstructionEntry
    | ParsedSystemInstructionEntry
    | UnparsedInstructionEntry;

export interface ParsedTokenTransaction {
    version: 'legacy' | 0;
    feePayer: Address;
    /** Address-keyed map of signatures (null when not yet signed). */
    signatures: Record<string, Uint8Array | null>;
    instructions: ParsedTransactionInstruction[];
    summary: Record<TokenInstructionCategory, number>;
    /** All Token-2022 instructions in order. */
    token2022Instructions: ParsedToken2022InstructionEntry[];
    /** Token transfers, including confidential transfer variants. */
    transferInstructions: ParsedTransactionInstruction[];
    /**
     * Mint-level administration: init, config updates, pause/freeze, supply,
     * fee harvest, confidential config, metadata emit.
     */
    adminInstructions: ParsedTransactionInstruction[];
}

export interface ParseTokenTransactionOptions {
    /** Provide pre-fetched LUT contents to resolve v0 lookups synchronously. */
    addressesByLookupTableAddress?: AddressesByLookupTableAddress;
}

const TOKEN_2022_CATEGORY: Record<Token2022Instruction, TokenInstructionCategory> = {
    [Token2022Instruction.InitializeMint]: 'mint-init',
    [Token2022Instruction.InitializeMint2]: 'mint-init',
    [Token2022Instruction.InitializeMintCloseAuthority]: 'mint-init',
    [Token2022Instruction.InitializePermanentDelegate]: 'mint-init',
    [Token2022Instruction.InitializeMetadataPointer]: 'mint-init',
    [Token2022Instruction.InitializeDefaultAccountState]: 'mint-init',
    [Token2022Instruction.InitializePausableConfig]: 'mint-init',
    [Token2022Instruction.InitializeTokenMetadata]: 'mint-init',
    [Token2022Instruction.InitializeScaledUiAmountMint]: 'mint-init',
    [Token2022Instruction.InitializeTransferFeeConfig]: 'mint-init',
    [Token2022Instruction.InitializeConfidentialTransferMint]: 'mint-init',
    [Token2022Instruction.InitializeConfidentialTransferFee]: 'mint-init',
    [Token2022Instruction.InitializeTransferHook]: 'mint-init',
    [Token2022Instruction.InitializePermissionedBurn]: 'mint-init',
    [Token2022Instruction.InitializeInterestBearingMint]: 'mint-init',
    [Token2022Instruction.InitializeNonTransferableMint]: 'mint-init',
    [Token2022Instruction.InitializeGroupPointer]: 'mint-init',
    [Token2022Instruction.InitializeGroupMemberPointer]: 'mint-init',
    [Token2022Instruction.InitializeTokenGroup]: 'mint-init',
    [Token2022Instruction.InitializeTokenGroupMember]: 'mint-init',
    [Token2022Instruction.CreateNativeMint]: 'mint-init',

    [Token2022Instruction.SetAuthority]: 'mint-config-update',
    [Token2022Instruction.UpdateDefaultAccountState]: 'mint-config-update',
    [Token2022Instruction.UpdateMetadataPointer]: 'mint-config-update',
    [Token2022Instruction.UpdateTokenMetadataField]: 'mint-config-update',
    [Token2022Instruction.RemoveTokenMetadataKey]: 'mint-config-update',
    [Token2022Instruction.UpdateTokenMetadataUpdateAuthority]: 'mint-config-update',
    [Token2022Instruction.UpdateMultiplierScaledUiMint]: 'mint-config-update',
    [Token2022Instruction.UpdateRateInterestBearingMint]: 'mint-config-update',
    [Token2022Instruction.SetTransferFee]: 'mint-config-update',
    [Token2022Instruction.UpdateConfidentialTransferMint]: 'mint-config-update',
    [Token2022Instruction.UpdateTransferHook]: 'mint-config-update',
    [Token2022Instruction.UpdateGroupPointer]: 'mint-config-update',
    [Token2022Instruction.UpdateGroupMemberPointer]: 'mint-config-update',
    [Token2022Instruction.UpdateTokenGroupMaxSize]: 'mint-config-update',
    [Token2022Instruction.UpdateTokenGroupUpdateAuthority]: 'mint-config-update',

    [Token2022Instruction.Pause]: 'pause',
    [Token2022Instruction.Resume]: 'pause',

    [Token2022Instruction.MintTo]: 'supply',
    [Token2022Instruction.MintToChecked]: 'supply',
    [Token2022Instruction.Burn]: 'supply',
    [Token2022Instruction.BurnChecked]: 'supply',
    [Token2022Instruction.PermissionedBurn]: 'supply',
    [Token2022Instruction.PermissionedBurnChecked]: 'supply',

    [Token2022Instruction.FreezeAccount]: 'freeze',
    [Token2022Instruction.ThawAccount]: 'freeze',

    [Token2022Instruction.Transfer]: 'transfer',
    [Token2022Instruction.TransferChecked]: 'transfer',
    [Token2022Instruction.TransferCheckedWithFee]: 'transfer',
    [Token2022Instruction.ConfidentialTransfer]: 'transfer',
    [Token2022Instruction.ConfidentialTransferWithFee]: 'transfer',
    [Token2022Instruction.ConfidentialDeposit]: 'transfer',
    [Token2022Instruction.ConfidentialWithdraw]: 'transfer',

    [Token2022Instruction.Approve]: 'delegation',
    [Token2022Instruction.ApproveChecked]: 'delegation',
    [Token2022Instruction.Revoke]: 'delegation',

    [Token2022Instruction.InitializeAccount]: 'account-init',
    [Token2022Instruction.InitializeAccount2]: 'account-init',
    [Token2022Instruction.InitializeAccount3]: 'account-init',
    [Token2022Instruction.InitializeMultisig]: 'account-init',
    [Token2022Instruction.InitializeMultisig2]: 'account-init',
    [Token2022Instruction.InitializeImmutableOwner]: 'account-init',

    [Token2022Instruction.CloseAccount]: 'account-lifecycle',
    [Token2022Instruction.Reallocate]: 'account-lifecycle',
    [Token2022Instruction.SyncNative]: 'account-lifecycle',
    [Token2022Instruction.WithdrawExcessLamports]: 'account-lifecycle',
    [Token2022Instruction.UnwrapLamports]: 'account-lifecycle',

    [Token2022Instruction.WithdrawWithheldTokensFromMint]: 'fee-harvest',
    [Token2022Instruction.WithdrawWithheldTokensFromAccounts]: 'fee-harvest',
    [Token2022Instruction.HarvestWithheldTokensToMint]: 'fee-harvest',
    [Token2022Instruction.WithdrawWithheldTokensFromMintForConfidentialTransferFee]: 'fee-harvest',
    [Token2022Instruction.WithdrawWithheldTokensFromAccountsForConfidentialTransferFee]: 'fee-harvest',
    [Token2022Instruction.HarvestWithheldTokensToMintForConfidentialTransferFee]: 'fee-harvest',
    [Token2022Instruction.EnableHarvestToMint]: 'fee-harvest',
    [Token2022Instruction.DisableHarvestToMint]: 'fee-harvest',

    [Token2022Instruction.ConfigureConfidentialTransferAccount]: 'confidential-config',
    [Token2022Instruction.ApproveConfidentialTransferAccount]: 'confidential-config',
    [Token2022Instruction.EmptyConfidentialTransferAccount]: 'confidential-config',
    [Token2022Instruction.ApplyConfidentialPendingBalance]: 'confidential-config',
    [Token2022Instruction.EnableConfidentialCredits]: 'confidential-config',
    [Token2022Instruction.DisableConfidentialCredits]: 'confidential-config',
    [Token2022Instruction.EnableNonConfidentialCredits]: 'confidential-config',
    [Token2022Instruction.DisableNonConfidentialCredits]: 'confidential-config',
    [Token2022Instruction.EnableMemoTransfers]: 'confidential-config',
    [Token2022Instruction.DisableMemoTransfers]: 'confidential-config',
    [Token2022Instruction.EnableCpiGuard]: 'confidential-config',
    [Token2022Instruction.DisableCpiGuard]: 'confidential-config',

    [Token2022Instruction.EmitTokenMetadata]: 'metadata-emit',

    [Token2022Instruction.AmountToUiAmount]: 'other-token2022',
    [Token2022Instruction.UiAmountToAmount]: 'other-token2022',
    [Token2022Instruction.GetAccountDataSize]: 'other-token2022',
};

const TRANSFER_CATEGORIES: ReadonlySet<TokenInstructionCategory> = new Set(['transfer']);
const ADMIN_CATEGORIES: ReadonlySet<TokenInstructionCategory> = new Set([
    'mint-init',
    'mint-config-update',
    'pause',
    'freeze',
    'supply',
    'fee-harvest',
    'confidential-config',
    'metadata-emit',
]);

function emptySummary(): Record<TokenInstructionCategory, number> {
    return {
        'mint-init': 0,
        'mint-config-update': 0,
        pause: 0,
        supply: 0,
        freeze: 0,
        transfer: 0,
        delegation: 0,
        'account-init': 0,
        'account-lifecycle': 0,
        'fee-harvest': 0,
        'confidential-config': 0,
        'metadata-emit': 0,
        'other-token2022': 0,
        other: 0,
    };
}

function normalizeInput(input: RawTransactionInput): Uint8Array {
    if (input instanceof Uint8Array) {
        return input;
    }
    if (input.format === 'bytes') {
        if (typeof input.data === 'string') {
            throw new Error("RawTransactionInput format 'bytes' requires Uint8Array data");
        }
        return input.data;
    }
    if (typeof input.data !== 'string') {
        throw new Error(`RawTransactionInput format '${input.format}' requires string data`);
    }
    const encoder = input.format === 'base64' ? getBase64Encoder() : getBase58Encoder();
    return new Uint8Array(encoder.encode(input.data));
}

type DataInstruction = Instruction &
    InstructionWithAccounts<readonly (AccountMeta | AccountLookupMeta)[]> &
    InstructionWithData<ReadonlyUint8Array>;

function hasData(ix: Instruction): ix is DataInstruction {
    return ix.data !== undefined && ix.data.length > 0 && ix.accounts !== undefined;
}

function classifyInstruction(ix: Instruction, index: number): ParsedTransactionInstruction {
    const programAddress = ix.programAddress;
    const accounts = ix.accounts ?? [];
    const base = { index, programAddress, accounts, rawData: ix.data } as const;

    if (programAddress === TOKEN_2022_PROGRAM_ADDRESS) {
        if (!hasData(ix)) {
            return {
                ...base,
                programLabel: 'token-2022',
                category: 'other-token2022',
                token2022: { name: 'Unknown', instructionType: -1 as Token2022Instruction },
            };
        }
        const instructionType = identifyToken2022Instruction(ix.data);
        const category = TOKEN_2022_CATEGORY[instructionType] ?? 'other-token2022';
        // Some Token-2022 instructions (notably the SPL token-metadata interface
        // variants, where data shapes vary) don't always decode cleanly via the
        // codama-generated parser when handed real on-chain bytes. Identification
        // by discriminator still works, so fall back to that and surface the
        // decode error rather than failing the whole transaction parse.
        let parsed: ParsedToken2022Instruction<string> | undefined;
        let parseError: string | undefined;
        try {
            parsed = parseToken2022Instruction(ix);
        } catch (e) {
            parseError = e instanceof Error ? e.message : String(e);
        }
        return {
            ...base,
            programLabel: 'token-2022',
            category,
            token2022: { name: Token2022Instruction[instructionType], instructionType, parsed, parseError },
        };
    }

    if (programAddress === ASSOCIATED_TOKEN_PROGRAM_ADDRESS) {
        // ATA Create/CreateIdempotent encode the discriminator in a single byte
        // (legacy zero-length convention treats empty data as CreateAssociatedToken).
        const dataIx: DataInstruction = hasData(ix)
            ? ix
            : ({
                  ...ix,
                  accounts: ix.accounts ?? [],
                  data: new Uint8Array([0]) as ReadonlyUint8Array,
              } as DataInstruction);
        const instructionType = identifyAssociatedTokenInstruction(dataIx.data);
        let parsed: ParsedAssociatedTokenInstruction<string> | undefined;
        let parseError: string | undefined;
        try {
            parsed = parseAssociatedTokenInstruction(dataIx);
        } catch (e) {
            parseError = e instanceof Error ? e.message : String(e);
        }
        return {
            ...base,
            programLabel: 'associated-token',
            category: 'account-init',
            associatedToken: { name: AssociatedTokenInstruction[instructionType], instructionType, parsed, parseError },
        };
    }

    if (programAddress === SYSTEM_PROGRAM_ADDRESS) {
        if (!hasData(ix)) {
            return { ...base, programLabel: 'unknown', category: 'other' };
        }
        // System parsers require concrete AccountMeta accounts (no lookup metas).
        // System-program calls never reference LUT-loaded accounts, so the cast is
        // safe in practice; @solana-program/system just doesn't model the union.
        const sysIx = ix as Instruction &
            InstructionWithAccounts<readonly AccountMeta[]> &
            InstructionWithData<ReadonlyUint8Array>;
        const instructionType = identifySystemInstruction(sysIx.data);
        let parsed: ParsedSystemPayload | undefined;
        let category: TokenInstructionCategory = 'other';
        switch (instructionType) {
            case SystemInstruction.CreateAccount:
                parsed = parseCreateAccountInstruction(sysIx);
                category = 'account-init';
                break;
            case SystemInstruction.CreateAccountWithSeed:
                parsed = parseCreateAccountWithSeedInstruction(sysIx);
                category = 'account-init';
                break;
            case SystemInstruction.Allocate:
                parsed = parseAllocateInstruction(sysIx);
                category = 'account-init';
                break;
            case SystemInstruction.AllocateWithSeed:
                parsed = parseAllocateWithSeedInstruction(sysIx);
                category = 'account-init';
                break;
            case SystemInstruction.TransferSol:
                parsed = parseTransferSolInstruction(sysIx);
                break;
            default:
                break;
        }
        return {
            ...base,
            programLabel: 'system',
            category,
            system: { name: SystemInstruction[instructionType], instructionType, parsed },
        };
    }

    if (programAddress === TOKEN_ACL_PROGRAM_ID) {
        return { ...base, programLabel: 'token-acl', category: 'other' };
    }

    return { ...base, programLabel: 'unknown', category: 'other' };
}

function buildResult(
    decompiled: { instructions: ReadonlyArray<Instruction>; feePayer: { address: Address }; version: 'legacy' | 0 },
    signatures: Record<string, ReadonlyUint8Array | Uint8Array | null>,
    version: 'legacy' | 0,
): ParsedTokenTransaction {
    const summary = emptySummary();
    const instructions: ParsedTransactionInstruction[] = decompiled.instructions.map((ix, i) => {
        const entry = classifyInstruction(ix, i);
        summary[entry.category] += 1;
        return entry;
    });

    const sigRecord: Record<string, Uint8Array | null> = {};
    for (const [addr, sig] of Object.entries(signatures)) {
        sigRecord[addr] = sig ? new Uint8Array(sig) : null;
    }

    return {
        version,
        feePayer: decompiled.feePayer.address,
        signatures: sigRecord,
        instructions,
        summary,
        token2022Instructions: instructions.filter(
            (e): e is ParsedToken2022InstructionEntry => e.programLabel === 'token-2022',
        ),
        transferInstructions: instructions.filter(e => TRANSFER_CATEGORIES.has(e.category)),
        adminInstructions: instructions.filter(e => ADMIN_CATEGORIES.has(e.category)),
    };
}

/**
 * Parses raw Solana transaction wire bytes into a categorized view of its
 * Token-2022, Associated-Token, and System instructions.
 *
 * For v0 transactions that load accounts from address lookup tables, pass
 * `addressesByLookupTableAddress` to resolve those accounts. If you don't have
 * them locally, use {@link parseTokenTransactionWithLookups} to fetch via RPC.
 *
 * @throws if the transaction is v0 with unresolved lookup tables and no LUT
 *   addresses are supplied.
 */
export function parseTokenTransaction(
    input: RawTransactionInput,
    opts: ParseTokenTransactionOptions = {},
): ParsedTokenTransaction {
    const bytes = normalizeInput(input);
    const tx = getTransactionDecoder().decode(bytes);
    const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const decompiled = decompileTransactionMessage(compiled, {
        addressesByLookupTableAddress: opts.addressesByLookupTableAddress,
    });
    return buildResult(
        { instructions: decompiled.instructions ?? [], feePayer: decompiled.feePayer, version: compiled.version },
        tx.signatures,
        compiled.version,
    );
}

/**
 * Async variant of {@link parseTokenTransaction} that resolves any address
 * lookup table accounts referenced by a v0 transaction by fetching the LUT
 * contents from `rpc`.
 */
export async function parseTokenTransactionWithLookups(
    input: RawTransactionInput,
    rpc: Rpc<GetMultipleAccountsApi & SolanaRpcApi>,
): Promise<ParsedTokenTransaction> {
    const bytes = normalizeInput(input);
    const tx = getTransactionDecoder().decode(bytes);
    const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const decompiled = await decompileTransactionMessageFetchingLookupTables(compiled, rpc);
    return buildResult(
        { instructions: decompiled.instructions ?? [], feePayer: decompiled.feePayer, version: compiled.version },
        tx.signatures,
        compiled.version,
    );
}

// ---------------------------------------------------------------------------
// Post-execution parsing: outer + inner instructions from a getTransaction
// response. CPIs are not present in pre-execution wire bytes; the cluster
// records them under meta.innerInstructions after the transaction lands.
// ---------------------------------------------------------------------------

/** A compiled inner instruction as returned by getTransaction(encoding: 'base64'). */
export interface ConfirmedInnerInstruction {
    /** Index into the resolved account list (static accounts ++ loaded LUT accounts). */
    programIdIndex: number;
    /** Indices into the resolved account list. */
    accounts: readonly number[];
    /** base58-encoded instruction data. */
    data: string;
    /** CPI nesting depth reported by the cluster (1 = outer, 2+ = inner). */
    stackHeight?: number | null;
}

/**
 * The shape we need from a kit `getTransaction` response (encoding: 'base64',
 * maxSupportedTransactionVersion: 0). Pass the response object directly.
 */
export interface ConfirmedTransactionInput {
    /** [base64WireTransaction, 'base64'] tuple, or just the raw bytes. */
    transaction: readonly [string, 'base64'] | Uint8Array;
    meta?: {
        innerInstructions?: ReadonlyArray<{
            /** Index of the outer instruction whose execution emitted these CPIs. */
            index: number;
            instructions: ReadonlyArray<ConfirmedInnerInstruction>;
        }> | null;
        /**
         * For v0 transactions, the cluster reports the addresses loaded from each
         * LUT (readonly + writable). Pass these so we can resolve LUT-referenced
         * accounts without a second RPC round trip.
         */
        loadedAddresses?: {
            readonly: readonly Address[];
            writable: readonly Address[];
        } | null;
        /** Set when the transaction failed. We surface it on the result. */
        err?: unknown;
    } | null;
}

export interface ParsedConfirmedTransaction extends ParsedTokenTransaction {
    /** Transaction-level error from meta.err, if any. */
    error?: unknown;
    /**
     * Flat view of every CPI emitted across all outer instructions, useful for
     * "did any inner ix do X?" scans. The hierarchical view is preserved on
     * each outer instruction's `innerInstructions` field.
     */
    flatInnerInstructions: ParsedTransactionInstruction[];
}

/**
 * Compute role flags for the resolved account list using the conventions
 * documented on the message header. v0 LUT-loaded writables come right after
 * the static accounts; readonlys come last.
 */
function buildResolvedAccountMetas(
    compiled: ReturnType<typeof getCompiledTransactionMessageDecoder>['decode'] extends (
        b: ReadonlyUint8Array,
    ) => infer R
        ? R
        : never,
    loadedAddresses?: { writable: readonly Address[]; readonly: readonly Address[] } | null,
): AccountMeta[] {
    const { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts } = compiled.header;
    const staticCount = compiled.staticAccounts.length;
    const metas: AccountMeta[] = [];
    for (let i = 0; i < staticCount; i += 1) {
        const isSigner = i < numSignerAccounts;
        const isReadonly = isSigner
            ? i >= numSignerAccounts - numReadonlySignerAccounts
            : i >= staticCount - numReadonlyNonSignerAccounts;
        const role = isSigner
            ? isReadonly
                ? AccountRole.READONLY_SIGNER
                : AccountRole.WRITABLE_SIGNER
            : isReadonly
              ? AccountRole.READONLY
              : AccountRole.WRITABLE;
        metas.push({ address: compiled.staticAccounts[i], role });
    }
    if (loadedAddresses && compiled.version === 0) {
        for (const addr of loadedAddresses.writable) {
            metas.push({ address: addr, role: AccountRole.WRITABLE });
        }
        for (const addr of loadedAddresses.readonly) {
            metas.push({ address: addr, role: AccountRole.READONLY });
        }
    }
    return metas;
}

function compiledIxToInstruction(
    ix: { programAddressIndex: number; accountIndices?: number[]; data?: ReadonlyUint8Array },
    accountMetas: AccountMeta[],
): Instruction {
    const programMeta = accountMetas[ix.programAddressIndex];
    if (!programMeta) {
        throw new Error(`Instruction references unknown program index ${ix.programAddressIndex}`);
    }
    const accounts = (ix.accountIndices ?? []).map(i => {
        const meta = accountMetas[i];
        if (!meta) throw new Error(`Instruction references unknown account index ${i}`);
        return meta;
    });
    return {
        programAddress: programMeta.address,
        accounts,
        data: ix.data,
    };
}

function innerToInstruction(inner: ConfirmedInnerInstruction, accountMetas: AccountMeta[]): Instruction {
    const programMeta = accountMetas[inner.programIdIndex];
    if (!programMeta) {
        throw new Error(`Inner instruction references unknown program index ${inner.programIdIndex}`);
    }
    const accounts = inner.accounts.map(i => {
        const meta = accountMetas[i];
        if (!meta) throw new Error(`Inner instruction references unknown account index ${i}`);
        return meta;
    });
    return {
        programAddress: programMeta.address,
        accounts,
        data: getBase58Encoder().encode(inner.data) as ReadonlyUint8Array,
    };
}

/**
 * Parses a confirmed `getTransaction` response. Unlike
 * {@link parseTokenTransaction}, this also walks `meta.innerInstructions` so
 * CPIs invoked by each outer instruction are categorized and attached under
 * `outerInstruction.innerInstructions`.
 *
 * The response should be fetched with `encoding: 'base64'` and
 * `maxSupportedTransactionVersion: 0` so the wire bytes, inner instructions,
 * and `loadedAddresses` (for v0) all come back together.
 */
export function parseConfirmedTransaction(input: ConfirmedTransactionInput): ParsedConfirmedTransaction {
    const wireBytes =
        input.transaction instanceof Uint8Array
            ? input.transaction
            : new Uint8Array(getBase64Encoder().encode(input.transaction[0]));
    const tx = getTransactionDecoder().decode(wireBytes);
    const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const accountMetas = buildResolvedAccountMetas(compiled, input.meta?.loadedAddresses);

    const summary = emptySummary();

    const outer: ParsedTransactionInstruction[] = compiled.instructions.map((ix, i) => {
        const instruction = compiledIxToInstruction(ix, accountMetas);
        const entry = classifyInstruction(instruction, i);
        entry.stackHeight = 1;
        summary[entry.category] += 1;
        return entry;
    });

    const flatInners: ParsedTransactionInstruction[] = [];
    if (input.meta?.innerInstructions) {
        for (const group of input.meta.innerInstructions) {
            const target = outer[group.index];
            if (!target) {
                // Inner-instruction group references an outer index we don't have;
                // skip rather than throw — protects against malformed responses.
                continue;
            }
            const parsed = group.instructions.map((rawInner, i) => {
                const instruction = innerToInstruction(rawInner, accountMetas);
                const entry = classifyInstruction(instruction, i);
                entry.stackHeight = rawInner.stackHeight ?? 2;
                summary[entry.category] += 1;
                flatInners.push(entry);
                return entry;
            });
            target.innerInstructions = parsed;
        }
    }

    const sigRecord: Record<string, Uint8Array | null> = {};
    for (const [addr, sig] of Object.entries(tx.signatures)) {
        sigRecord[addr] = sig ? new Uint8Array(sig) : null;
    }

    const allInstructions: ParsedTransactionInstruction[] = [...outer, ...flatInners];
    return {
        version: compiled.version,
        feePayer: accountMetas[0].address,
        signatures: sigRecord,
        instructions: outer,
        summary,
        token2022Instructions: allInstructions.filter(
            (e): e is ParsedToken2022InstructionEntry => e.programLabel === 'token-2022',
        ),
        transferInstructions: allInstructions.filter(e => TRANSFER_CATEGORIES.has(e.category)),
        adminInstructions: allInstructions.filter(e => ADMIN_CATEGORIES.has(e.category)),
        flatInnerInstructions: flatInners,
        error: input.meta?.err ?? undefined,
    };
}
