import {
    AccountRole,
    getAddressEncoder,
    getProgramDerivedAddress,
    getU64Encoder,
    type Address,
    type Rpc,
    type SolanaRpcApi,
} from '@solana/kit';
import {
    findAssociatedTokenPda,
    getTransferCheckedInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { createMockSigner } from '../../__tests__/test-utils.js';
import {
    EXECUTE_INSTRUCTION_DISCRIMINATOR,
    decodeExtraAccountMetaList,
    deEscalateAccountMeta,
    encodeExtraAccountMetas,
    findExtraAccountMetaListPda,
    getTransferHookProgramId,
    resolveExtraAccountMetasForExecute,
    withTransferHookAccounts,
    type ExtraAccountMeta,
} from '../transfer-hook.js';
import { createTransferInstructions } from '../index.js';

const HOOK = 'FpkgZNfydbXDX7mXAjZCHwKngPnkSJkJAkkSd7Ffmw3t' as Address;
const MINT = 'Mint777777777777777777777777777777777777777' as Address;
const SOURCE = 'Src7777777777777777777777777777777777777777' as Address;
const DESTINATION = 'Dst7777777777777777777777777777777777777777' as Address;
const OWNER = 'Wner777777777777777777777777777777777777777' as Address;
const FIXED = 'SysvarRent111111111111111111111111111111111' as Address;
const OTHER = 'xtra777777777777777777777777777777777777777' as Address;

const enc = getAddressEncoder();

type Stored = { owner: Address; base64?: Uint8Array; jsonParsed?: unknown };

/** Mock RPC answering `getAccountInfo` in base64 or jsonParsed, recording every call. */
function mockRpc(accounts: Record<string, Stored>) {
    const calls: Array<{ address: string; encoding?: string; commitment?: string }> = [];
    const rpc = {
        getAccountInfo: (address: Address, opts?: { encoding?: string; commitment?: string }) => ({
            send: async () => {
                calls.push({ address, encoding: opts?.encoding, commitment: opts?.commitment });
                const stored = accounts[address];
                if (!stored) return { value: null };
                const base = { owner: stored.owner, executable: false, lamports: 1n, space: 0n };
                if (opts?.encoding === 'jsonParsed') {
                    return stored.jsonParsed
                        ? { value: { ...base, data: { parsed: { info: stored.jsonParsed } } } }
                        : { value: null };
                }
                const data = stored.base64 ?? new Uint8Array();
                return { value: { ...base, data: [Buffer.from(data).toString('base64'), 'base64'] } };
            },
        }),
        getLatestBlockhash: () => ({
            send: async () => ({
                value: { blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', lastValidBlockHeight: 1n },
            }),
        }),
    };
    return { rpc: rpc as unknown as Rpc<SolanaRpcApi>, calls };
}

/** Validation account data: one TLV entry of type Execute holding the encoded metas. */
function validationData(metas: ExtraAccountMeta[], prefix: Uint8Array = new Uint8Array()): Uint8Array {
    const value = encodeExtraAccountMetas(metas);
    const out = new Uint8Array(prefix.length + 12 + value.length);
    out.set(prefix, 0);
    out.set(EXECUTE_INSTRUCTION_DISCRIMINATOR, prefix.length);
    new DataView(out.buffer).setUint32(prefix.length + 8, value.length, true);
    out.set(value, prefix.length + 12);
    return out;
}

/** A token account's data with `owner` at bytes 32..64. */
function tokenAccountData(owner: Address): Uint8Array {
    const data = new Uint8Array(165);
    data.set(enc.encode(MINT), 0);
    data.set(enc.encode(owner), 32);
    return data;
}

const ALL_KINDS: ExtraAccountMeta[] = [
    { config: { __kind: 'Literal', address: FIXED }, isSigner: false, isWritable: false },
    {
        config: {
            __kind: 'ProgramPda',
            seeds: [
                { __kind: 'Literal', bytes: new TextEncoder().encode('seed') },
                { __kind: 'AccountKey', index: 1 },
            ],
        },
        isSigner: false,
        isWritable: true,
    },
    {
        config: { __kind: 'ProgramPda', seeds: [{ __kind: 'InstructionData', index: 8, length: 8 }] },
        isSigner: false,
        isWritable: false,
    },
    {
        config: {
            __kind: 'ProgramPda',
            seeds: [{ __kind: 'AccountData', accountIndex: 0, dataIndex: 32, length: 32 }],
        },
        isSigner: false,
        isWritable: false,
    },
    {
        config: { __kind: 'PubkeyData', pubkeyData: { __kind: 'AccountData', accountIndex: 2, dataIndex: 32 } },
        isSigner: false,
        isWritable: true,
    },
    {
        config: { __kind: 'AccountPda', accountIndex: 5, seeds: [{ __kind: 'AccountKey', index: 6 }] },
        isSigner: true,
        isWritable: false,
    },
];

describe('extra account meta codec', () => {
    test('round-trips every address config kind', () => {
        expect(decodeExtraAccountMetaList(validationData(ALL_KINDS))).toEqual(ALL_KINDS);
    });

    test('decodes PubkeyData read from the instruction data', () => {
        const metas: ExtraAccountMeta[] = [
            {
                config: { __kind: 'PubkeyData', pubkeyData: { __kind: 'InstructionData', index: 4 } },
                isSigner: false,
                isWritable: false,
            },
        ];
        expect(decodeExtraAccountMetaList(validationData(metas))).toEqual(metas);
    });

    test('skips TLV entries of other types before the Execute entry', () => {
        const other = new Uint8Array(12 + 3);
        other.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
        new DataView(other.buffer).setUint32(8, 3, true);
        expect(decodeExtraAccountMetaList(validationData(ALL_KINDS, other))).toEqual(ALL_KINDS);
    });

    test('rejects data with no Execute entry', () => {
        expect(() => decodeExtraAccountMetaList(new Uint8Array(32))).toThrow('no Execute entry');
    });

    test('rejects an unknown address config discriminator', () => {
        const data = validationData([ALL_KINDS[0]]);
        data[16] = 3;
        expect(() => decodeExtraAccountMetaList(data)).toThrow('unknown extra account meta discriminator 3');
    });

    test('rejects a seed config longer than 32 bytes', () => {
        const meta: ExtraAccountMeta = {
            config: { __kind: 'ProgramPda', seeds: [{ __kind: 'Literal', bytes: new Uint8Array(31) }] },
            isSigner: false,
            isWritable: false,
        };
        expect(() => encodeExtraAccountMetas([meta])).toThrow('over the 32-byte limit');
    });

    test.each<[string, ExtraAccountMeta['config'], string]>([
        [
            'an account-data seed offset past 255',
            { __kind: 'ProgramPda', seeds: [{ __kind: 'AccountData', accountIndex: 0, dataIndex: 256, length: 32 }] },
            'account-data seed dataIndex must be an integer in 0..255, got 256',
        ],
        [
            'a fractional instruction-data seed length',
            { __kind: 'ProgramPda', seeds: [{ __kind: 'InstructionData', index: 8, length: 1.5 }] },
            'instruction-data seed length must be an integer in 0..255, got 1.5',
        ],
        [
            'a negative account-key seed index',
            { __kind: 'ProgramPda', seeds: [{ __kind: 'AccountKey', index: -1 }] },
            'account-key seed index must be an integer in 0..255, got -1',
        ],
        [
            'a negative pubkey-data instruction offset',
            { __kind: 'PubkeyData', pubkeyData: { __kind: 'InstructionData', index: -1 } },
            'pubkey data index must be an integer in 0..255, got -1',
        ],
        [
            'a pubkey-data account offset past 255',
            { __kind: 'PubkeyData', pubkeyData: { __kind: 'AccountData', accountIndex: 0, dataIndex: 300 } },
            'pubkey data dataIndex must be an integer in 0..255, got 300',
        ],
        [
            'a negative AccountPda program index',
            { __kind: 'AccountPda', accountIndex: -1, seeds: [] },
            'PDA program accountIndex must be an integer in 0..255, got -1',
        ],
    ])('rejects %s instead of wrapping it', (_, config, message) => {
        const meta: ExtraAccountMeta = { config, isSigner: false, isWritable: false };
        expect(() => encodeExtraAccountMetas([meta])).toThrow(message);
    });
});

describe('resolveExtraAccountMetasForExecute', () => {
    async function validationAccount() {
        const [pda] = await findExtraAccountMetaListPda({ mint: MINT }, { programAddress: HOOK });
        return pda;
    }

    test('resolves every seed kind in order, then appends the hook program and validation account', async () => {
        const validation = await validationAccount();
        const destinationOwner = OTHER;
        const { rpc, calls } = mockRpc({
            [validation]: { owner: HOOK, base64: validationData(ALL_KINDS) },
            [SOURCE]: { owner: TOKEN_2022_PROGRAM_ADDRESS, base64: tokenAccountData(OWNER) },
            [DESTINATION]: { owner: TOKEN_2022_PROGRAM_ADDRESS, base64: tokenAccountData(destinationOwner) },
        });

        const metas = await resolveExtraAccountMetasForExecute({
            rpc,
            transferHookProgramAddress: HOOK,
            source: SOURCE,
            mint: MINT,
            destination: DESTINATION,
            owner: OWNER,
            amount: 42n,
        });

        const [seedPda] = await getProgramDerivedAddress({
            programAddress: HOOK,
            seeds: ['seed', enc.encode(MINT)],
        });
        const [amountPda] = await getProgramDerivedAddress({
            programAddress: HOOK,
            seeds: [getU64Encoder().encode(42n)],
        });
        const [ownerPda] = await getProgramDerivedAddress({ programAddress: HOOK, seeds: [enc.encode(OWNER)] });
        const [accountPda] = await getProgramDerivedAddress({ programAddress: FIXED, seeds: [enc.encode(seedPda)] });

        expect(metas).toEqual([
            { address: FIXED, role: AccountRole.READONLY },
            { address: seedPda, role: AccountRole.WRITABLE },
            { address: amountPda, role: AccountRole.READONLY },
            { address: ownerPda, role: AccountRole.READONLY },
            { address: destinationOwner, role: AccountRole.WRITABLE },
            { address: accountPda, role: AccountRole.READONLY_SIGNER },
            { address: HOOK, role: AccountRole.READONLY },
            { address: validation, role: AccountRole.READONLY },
        ]);
        // Reads at `confirmed`, each account once.
        expect(calls.map(c => c.address)).toEqual([validation, SOURCE, DESTINATION]);
        expect(calls.every(c => c.commitment === 'confirmed')).toBe(true);
    });

    test('resolves PubkeyData from the Execute instruction data', async () => {
        const validation = await validationAccount();
        const metas: ExtraAccountMeta[] = [
            {
                // Bytes 8..16 are the amount; reading 32 bytes from index 0 overruns 16 bytes of data.
                config: { __kind: 'PubkeyData', pubkeyData: { __kind: 'InstructionData', index: 0 } },
                isSigner: false,
                isWritable: false,
            },
        ];
        const { rpc } = mockRpc({ [validation]: { owner: HOOK, base64: validationData(metas) } });
        await expect(
            resolveExtraAccountMetasForExecute({
                rpc,
                transferHookProgramAddress: HOOK,
                source: SOURCE,
                mint: MINT,
                destination: DESTINATION,
                owner: OWNER,
                amount: 1n,
            }),
        ).rejects.toThrow('pubkey data runs past the end of the instruction data');
    });

    test('de-escalates an extra that repeats a base account', async () => {
        const validation = await validationAccount();
        const metas: ExtraAccountMeta[] = [
            { config: { __kind: 'Literal', address: SOURCE }, isSigner: true, isWritable: true },
            { config: { __kind: 'Literal', address: OTHER }, isSigner: false, isWritable: true },
            { config: { __kind: 'Literal', address: OTHER }, isSigner: false, isWritable: true },
        ];
        const { rpc } = mockRpc({ [validation]: { owner: HOOK, base64: validationData(metas) } });
        const resolved = await resolveExtraAccountMetasForExecute({
            rpc,
            transferHookProgramAddress: HOOK,
            source: SOURCE,
            mint: MINT,
            destination: DESTINATION,
            owner: OWNER,
            amount: 1n,
        });
        expect(resolved.slice(0, 3)).toEqual([
            { address: SOURCE, role: AccountRole.READONLY },
            { address: OTHER, role: AccountRole.WRITABLE },
            { address: OTHER, role: AccountRole.WRITABLE },
        ]);
    });

    test('throws when the validation account is not initialized', async () => {
        const { rpc } = mockRpc({});
        await expect(
            resolveExtraAccountMetasForExecute({
                rpc,
                transferHookProgramAddress: HOOK,
                source: SOURCE,
                mint: MINT,
                destination: DESTINATION,
                owner: OWNER,
                amount: 1n,
            }),
        ).rejects.toThrow('extra account metas account');
    });

    test('throws when an account-data seed reads a missing account', async () => {
        const validation = await validationAccount();
        const { rpc } = mockRpc({ [validation]: { owner: HOOK, base64: validationData([ALL_KINDS[3]]) } });
        await expect(
            resolveExtraAccountMetasForExecute({
                rpc,
                transferHookProgramAddress: HOOK,
                source: SOURCE,
                mint: MINT,
                destination: DESTINATION,
                owner: OWNER,
                amount: 1n,
            }),
        ).rejects.toThrow(`reads account ${SOURCE}, which does not exist`);
    });

    test('rejects a seed that references an account past the resolved ones', async () => {
        const validation = await validationAccount();
        const metas: ExtraAccountMeta[] = [
            {
                config: { __kind: 'ProgramPda', seeds: [{ __kind: 'AccountKey', index: 5 }] },
                isSigner: false,
                isWritable: false,
            },
        ];
        const { rpc } = mockRpc({ [validation]: { owner: HOOK, base64: validationData(metas) } });
        await expect(
            resolveExtraAccountMetasForExecute({
                rpc,
                transferHookProgramAddress: HOOK,
                source: SOURCE,
                mint: MINT,
                destination: DESTINATION,
                owner: OWNER,
                amount: 1n,
            }),
        ).rejects.toThrow('account index 5');
    });
});

describe('deEscalateAccountMeta', () => {
    test('leaves an address not seen before untouched', () => {
        const meta = { address: OTHER, role: AccountRole.WRITABLE_SIGNER };
        expect(deEscalateAccountMeta(meta, [])).toBe(meta);
    });

    test('caps the role at the highest existing role of the address', () => {
        expect(
            deEscalateAccountMeta({ address: OTHER, role: AccountRole.WRITABLE_SIGNER }, [
                { address: OTHER, role: AccountRole.READONLY },
                { address: OTHER, role: AccountRole.READONLY_SIGNER },
            ]),
        ).toEqual({ address: OTHER, role: AccountRole.READONLY_SIGNER });
    });
});

describe('getTransferHookProgramId', () => {
    test('is null without a TransferHook extension', () => {
        expect(getTransferHookProgramId([{ extension: 'pausableConfig', state: {} }])).toBeNull();
    });

    test('is null for an inactive hook', () => {
        expect(getTransferHookProgramId([{ extension: 'transferHook', state: { programId: null } }])).toBeNull();
    });

    test('returns the program id of an active hook', () => {
        expect(getTransferHookProgramId([{ extension: 'transferHook', state: { programId: HOOK } }])).toBe(HOOK);
    });
});

describe('withTransferHookAccounts', () => {
    test('returns the same instruction without an RPC call when no hook is active', async () => {
        const { rpc, calls } = mockRpc({});
        const instruction = getTransferCheckedInstruction({
            source: SOURCE,
            mint: MINT,
            destination: DESTINATION,
            authority: createMockSigner(OWNER),
            amount: 1n,
            decimals: 6,
        });
        const result = await withTransferHookAccounts(instruction, {
            rpc,
            transferHookProgramAddress: null,
            source: SOURCE,
            mint: MINT,
            destination: DESTINATION,
            owner: OWNER,
            amount: 1n,
        });
        expect(result).toBe(instruction);
        expect(calls).toHaveLength(0);
    });
});

describe('createTransferInstructions with a transfer hook', () => {
    const sender = createMockSigner('Sndr777777777777777777777777777777777777777');
    const receiver = 'Rcvr777777777777777777777777777777777777777' as Address;

    async function setup(transferHook: { programId: Address | null } | undefined) {
        const [senderAta] = await findAssociatedTokenPda({
            owner: sender.address,
            mint: MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const [receiverAta] = await findAssociatedTokenPda({
            owner: receiver,
            mint: MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const [validation] = await findExtraAccountMetaListPda({ mint: MINT }, { programAddress: HOOK });
        const tokenInfo = { mint: MINT, state: 'initialized', tokenAmount: { amount: '5000000', uiAmount: 5 } };
        const { rpc, calls } = mockRpc({
            [MINT]: {
                owner: TOKEN_2022_PROGRAM_ADDRESS,
                jsonParsed: {
                    decimals: 6,
                    extensions: transferHook
                        ? [{ extension: 'transferHook', state: { authority: OWNER, ...transferHook } }]
                        : [],
                },
            },
            [senderAta]: { owner: TOKEN_2022_PROGRAM_ADDRESS, jsonParsed: tokenInfo },
            [receiverAta]: { owner: TOKEN_2022_PROGRAM_ADDRESS, jsonParsed: tokenInfo },
            [validation]: { owner: HOOK, base64: validationData([ALL_KINDS[0], ALL_KINDS[1]]) },
        });
        const plain = getTransferCheckedInstruction(
            {
                source: senderAta,
                destination: receiverAta,
                mint: MINT,
                authority: sender,
                amount: 1_500_000n,
                decimals: 6,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        const build = () =>
            createTransferInstructions({
                rpc,
                mint: MINT,
                from: sender.address,
                to: receiver,
                feePayer: sender,
                authority: sender,
                amount: '1.5',
            });
        return { build, calls, plain, validation };
    }

    test.each([
        ['no TransferHook extension', undefined],
        ['an inactive hook', { programId: null }],
    ])('emits the plain TransferChecked with no extra RPC call for %s', async (_label, hook) => {
        const { build, calls, plain } = await setup(hook);
        const instructions = await build();
        expect(instructions).toEqual([plain]);
        expect(calls).toHaveLength(5); // mint, sender wallet + ATA, receiver wallet + ATA
        expect(calls.some(c => c.encoding !== 'jsonParsed')).toBe(false);
    });

    test('appends the declared extras, the hook program and the validation account for an active hook', async () => {
        const { build, plain, validation } = await setup({ programId: HOOK });
        const [transfer] = await build();
        const [seedPda] = await getProgramDerivedAddress({ programAddress: HOOK, seeds: ['seed', enc.encode(MINT)] });
        expect(transfer.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(transfer.data).toEqual(plain.data);
        expect(transfer.accounts).toEqual([
            ...plain.accounts,
            { address: FIXED, role: AccountRole.READONLY },
            { address: seedPda, role: AccountRole.WRITABLE },
            { address: HOOK, role: AccountRole.READONLY },
            { address: validation, role: AccountRole.READONLY },
        ]);
    });
});
