import type { Address, Instruction, KeyPairSigner, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    assertIsFullySignedTransaction,
    generateKeyPairSigner,
    getSignersFromTransactionMessage,
    isTransactionSigner,
    none,
    signTransactionMessageWithSigners,
    some,
} from '@solana/kit';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    fetchMint,
    getUpdateTokenMetadataFieldDiscriminatorBytes,
} from '@solana-program/token-2022';
import { SYSTEM_PROGRAM_ADDRESS, getTransferSolInstructionDataDecoder } from '@solana-program/system';
import { createMockRpc } from '../../__tests__/test-utils.js';
import { createUpdateMetadataTransaction, type MetadataFieldUpdate } from '../update-metadata.js';

jest.mock('@solana-program/token-2022', () => ({
    ...jest.requireActual('@solana-program/token-2022'),
    fetchMint: jest.fn(),
}));

const SPACE = 400n;
/** Size-dependent rent, the shape of the real formula: (128 + space) * 3480 * 2. */
const rent = (space: bigint) => (128n + space) * 6960n;
const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
const FIELD_KINDS = ['Name', 'Symbol', 'Uri'] as const;
const ORIGINAL = { name: 'Test Token', symbol: 'TEST', uri: 'https://example.com/t.json' };

describe('createUpdateMetadataTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    let updateAuthority: KeyPairSigner;
    let feePayer: KeyPairSigner;
    let mint: KeyPairSigner;

    beforeAll(async () => {
        updateAuthority = await generateKeyPairSigner();
        feePayer = await generateKeyPairSigner();
        mint = await generateKeyPairSigner();
    });

    const mockMint = ({
        lamports = rent(SPACE),
        authority = some(updateAuthority.address) as ReturnType<typeof some<Address>> | ReturnType<typeof none>,
        programAddress = TOKEN_2022_PROGRAM_ADDRESS as Address,
        withMetadata = true,
    } = {}) => {
        (fetchMint as jest.Mock).mockResolvedValue({
            address: mint.address,
            programAddress,
            lamports,
            space: SPACE,
            executable: false,
            data: {
                extensions: some(
                    withMetadata
                        ? [
                              { __kind: 'MetadataPointer', authority: none(), metadataAddress: some(mint.address) },
                              {
                                  __kind: 'TokenMetadata',
                                  updateAuthority: authority,
                                  mint: mint.address,
                                  ...ORIGINAL,
                                  additionalMetadata: new Map(),
                              },
                          ]
                        : [{ __kind: 'MetadataPointer', authority: none(), metadataAddress: some(mint.address) }],
                ),
            },
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
        rpc = createMockRpc();
        (rpc as unknown as { getMinimumBalanceForRentExemption: unknown }).getMinimumBalanceForRentExemption = (
            space: bigint,
        ) => ({ send: () => Promise.resolve(rent(space)) });
        mockMint();
    });

    const build = (
        updates: MetadataFieldUpdate[],
        signers: { authority?: KeyPairSigner; payer?: KeyPairSigner } = {},
    ) =>
        createUpdateMetadataTransaction(rpc, {
            mint: mint.address,
            updateAuthority: signers.authority ?? updateAuthority,
            feePayer: signers.payer ?? feePayer,
            updates,
        });

    const isTransfer = (ix: Instruction) => ix.programAddress === SYSTEM_PROGRAM_ADDRESS;
    /**
     * Decodes UpdateTokenMetadataField data: 8-byte discriminator, u8 field kind, u32 length, UTF-8
     * value. Done by hand because token-2022 0.10.0's own data decoder fails on these bytes.
     */
    const metadataUpdates = (ixs: readonly Instruction[]) =>
        ixs
            .filter(ix => !isTransfer(ix))
            .map(ix => {
                const data = Buffer.from(ix.data!);
                expect(data.subarray(0, 8)).toEqual(Buffer.from(getUpdateTokenMetadataFieldDiscriminatorBytes()));
                expect(data.readUInt32LE(9)).toBe(data.length - 13);
                return { field: { __kind: FIELD_KINDS[data[8]] }, value: data.subarray(13).toString('utf8') };
            });

    test('builds one UpdateTokenMetadataField per update, in order, with no Reallocate', async () => {
        const tx = await build([
            { field: 'name', value: 'New Name' },
            { field: 'symbol', value: 'NEW' },
            { field: 'uri', value: 'https://example.com/n.json' },
        ]);

        expect(tx.instructions.some(ix => ix.data?.[0] === 29)).toBe(false);
        expect(tx.instructions.every(ix => ix.programAddress === TOKEN_2022_PROGRAM_ADDRESS)).toBe(true);
        expect(metadataUpdates(tx.instructions)).toEqual([
            { field: { __kind: 'Name' }, value: 'New Name' },
            { field: { __kind: 'Symbol' }, value: 'NEW' },
            { field: { __kind: 'Uri' }, value: 'https://example.com/n.json' },
        ]);
        expect(fetchMint).toHaveBeenCalledWith(rpc, mint.address, { commitment: 'confirmed' });
    });

    test('attaches the update authority and fee payer as signers', async () => {
        const tx = await build([{ field: 'symbol', value: 'NEW' }]);

        expect(isTransactionSigner(tx.feePayer)).toBe(true);
        expect(tx.feePayer.address).toBe(feePayer.address);
        const [metadataMeta, authorityMeta] = tx.instructions[0].accounts as readonly {
            address: string;
            signer?: unknown;
        }[];
        expect(metadataMeta.address).toBe(mint.address);
        expect(authorityMeta.address).toBe(updateAuthority.address);
        expect(authorityMeta.signer).toBe(updateAuthority);
        expect(getSignersFromTransactionMessage(tx)).toEqual(expect.arrayContaining([updateAuthority, feePayer]));
    });

    // Regression for HOO-955: the app used to set a plain fee-payer address and authority, so
    // signing with the attached signers threw SIGNATURES_MISSING.
    test('signs fully with the attached signers', async () => {
        const tx = await build([{ field: 'uri', value: ORIGINAL.uri + 'x'.repeat(200) }]);

        const signed = await signTransactionMessageWithSigners(tx);
        expect(() => assertIsFullySignedTransaction(signed)).not.toThrow();
        expect(Object.keys(signed.signatures).sort()).toEqual([updateAuthority.address, feePayer.address].sort());
    });

    test('a single wallet acting as authority and fee payer signs once, top-up included', async () => {
        const tx = await build([{ field: 'uri', value: ORIGINAL.uri + 'x'.repeat(200) }], { payer: updateAuthority });

        expect(isTransfer(tx.instructions[0])).toBe(true);
        const signed = await signTransactionMessageWithSigners(tx);
        expect(() => assertIsFullySignedTransaction(signed)).not.toThrow();
        expect(Object.keys(signed.signatures)).toEqual([updateAuthority.address]);
    });

    test('tops up exactly the missing rent first when the metadata grows past the spare lamports', async () => {
        const tx = await build([{ field: 'uri', value: ORIGINAL.uri + 'x'.repeat(200) }]);

        expect(tx.instructions).toHaveLength(2);
        const [transfer] = tx.instructions;
        expect(isTransfer(transfer)).toBe(true);
        expect(transfer.accounts?.[0]?.address).toBe(feePayer.address);
        expect(transfer.accounts?.[1]?.address).toBe(mint.address);
        expect(getTransferSolInstructionDataDecoder().decode(transfer.data!).amount).toBe(
            rent(SPACE + 200n) - rent(SPACE),
        );
    });

    test('sums the size change over every update, in order', async () => {
        // +50 bytes of URI, +3 of symbol; the name grows then shrinks back below its original length
        const tx = await build([
            { field: 'uri', value: ORIGINAL.uri + 'u'.repeat(50) },
            { field: 'name', value: 'n'.repeat(32) },
            { field: 'symbol', value: 'TESTABC' },
            { field: 'name', value: 'Test' },
        ]);

        expect(getTransferSolInstructionDataDecoder().decode(tx.instructions[0].data!).amount).toBe(
            rent(SPACE + 50n + 3n - 6n) - rent(SPACE),
        );
        expect(metadataUpdates(tx.instructions)).toHaveLength(4);
    });

    test('counts UTF-8 bytes, not characters', async () => {
        const tx = await build([{ field: 'name', value: 'Test Token €' }]); // +2 chars, +4 bytes

        expect(getTransferSolInstructionDataDecoder().decode(tx.instructions[0].data!).amount).toBe(
            rent(SPACE + 4n) - rent(SPACE),
        );
    });

    test('does not transfer when the spare lamports cover the growth', async () => {
        mockMint({ lamports: rent(SPACE) + 1_000_000n });

        const tx = await build([{ field: 'uri', value: ORIGINAL.uri + 'x'.repeat(100) }]);

        expect(tx.instructions.some(isTransfer)).toBe(false);
        expect(tx.instructions).toHaveLength(1);
    });

    test('does not transfer when the metadata shrinks', async () => {
        const tx = await build([{ field: 'name', value: 'T' }]);

        expect(tx.instructions.some(isTransfer)).toBe(false);
    });

    test('allows clearing a field with an empty string', async () => {
        const tx = await build([{ field: 'uri', value: '' }]);

        expect(metadataUpdates(tx.instructions)[0]).toMatchObject({ field: { __kind: 'Uri' }, value: '' });
    });

    test('throws when the metadata is immutable', async () => {
        mockMint({ authority: none() });

        await expect(build([{ field: 'symbol', value: 'NEW' }])).rejects.toThrow('Token metadata is immutable');
    });

    test('throws when the signer is not the metadata update authority', async () => {
        const other = await generateKeyPairSigner();

        await expect(build([{ field: 'symbol', value: 'NEW' }], { authority: other })).rejects.toThrow(
            `${other.address} is not the metadata update authority (${updateAuthority.address})`,
        );
    });

    test('throws when the mint has no embedded TokenMetadata', async () => {
        mockMint({ withMetadata: false });

        await expect(build([{ field: 'symbol', value: 'NEW' }])).rejects.toThrow('has no embedded TokenMetadata');
    });

    test('throws for a mint that is not owned by Token-2022', async () => {
        mockMint({ programAddress: TOKEN_PROGRAM_ADDRESS });

        await expect(build([{ field: 'symbol', value: 'NEW' }])).rejects.toThrow('is not a Token-2022 mint');
    });

    test('throws without updates or with an unknown field, before reading the chain', async () => {
        await expect(build([])).rejects.toThrow('At least one metadata field update is required');
        await expect(build([{ field: 'description' as 'name', value: 'x' }])).rejects.toThrow(
            'Invalid metadata field "description"',
        );
        expect(fetchMint).not.toHaveBeenCalled();
    });
});
