import {
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    isSome,
} from '@solana/kit';
import {
    fetchMint,
    getUpdateTokenMetadataFieldInstruction,
    tokenMetadataField,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { getTransferSolInstruction } from '@solana-program/system';
import type { FullTransaction } from '../transaction-util.js';

export type MetadataField = 'name' | 'symbol' | 'uri';

export interface MetadataFieldUpdate {
    field: MetadataField;
    /** New value; an empty string clears the field. */
    value: string;
}

export interface UpdateMetadataTransactionOptions {
    /** Mint whose embedded TokenMetadata extension is updated. */
    mint: Address;
    /** Current metadata update authority; must sign the transaction. */
    updateAuthority: TransactionSigner;
    /** Pays the fee and, when the metadata grows past the mint's spare lamports, the extra rent. */
    feePayer: TransactionSigner;
    /** Field updates, applied in order. */
    updates: ReadonlyArray<MetadataFieldUpdate>;
}

const FIELD_ARGS = {
    name: tokenMetadataField('Name'),
    symbol: tokenMetadataField('Symbol'),
    uri: tokenMetadataField('Uri'),
} as const;

const utf8Length = (value: string): bigint => BigInt(new TextEncoder().encode(value).length);

/**
 * Creates a transaction that updates the name, symbol and/or URI of a mint's embedded
 * TokenMetadata, signed by the metadata update authority.
 *
 * Token-2022 resizes the mint itself when a field changes length, so no `Reallocate` is needed,
 * but the mint must hold enough lamports for rent at the new size. When it doesn't, the
 * transaction starts with a transfer of the missing lamports from the fee payer to the mint.
 *
 * Throws before building anything when the mint has no embedded TokenMetadata, the metadata is
 * immutable, or `updateAuthority` isn't the metadata update authority.
 */
export const createUpdateMetadataTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    options: UpdateMetadataTransactionOptions,
): Promise<FullTransaction> => {
    const { mint, updateAuthority, feePayer, updates } = options;

    if (updates.length === 0) {
        throw new Error('At least one metadata field update is required');
    }
    for (const { field } of updates) {
        if (!Object.hasOwn(FIELD_ARGS, field)) {
            throw new Error(`Invalid metadata field "${String(field)}". Must be name, symbol, or uri`);
        }
    }

    const account = await fetchMint(rpc, mint, { commitment: 'confirmed' });
    if (account.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(`Mint ${mint} is not a Token-2022 mint`);
    }
    const extensions = isSome(account.data.extensions) ? account.data.extensions.value : [];
    const metadata = extensions.find(ext => ext.__kind === 'TokenMetadata');
    if (!metadata || metadata.__kind !== 'TokenMetadata') {
        throw new Error(`Mint ${mint} has no embedded TokenMetadata extension`);
    }
    if (!isSome(metadata.updateAuthority)) {
        throw new Error('Token metadata is immutable: it has no update authority');
    }
    if (metadata.updateAuthority.value !== updateAuthority.address) {
        throw new Error(
            `${updateAuthority.address} is not the metadata update authority (${metadata.updateAuthority.value})`,
        );
    }

    // Each field is stored as a u32 length prefix plus its UTF-8 bytes, so the mint grows or shrinks
    // by the difference in byte length. Apply the updates in order, the way the program does.
    const current: Record<MetadataField, string> = { name: metadata.name, symbol: metadata.symbol, uri: metadata.uri };
    let newSpace = account.space;
    for (const { field, value } of updates) {
        newSpace += utf8Length(value) - utf8Length(current[field]);
        current[field] = value;
    }

    const instructions: Instruction[] = [];
    const rentExempt = await rpc.getMinimumBalanceForRentExemption(newSpace).send();
    const topUp = BigInt(rentExempt) - BigInt(account.lamports);
    if (topUp > 0n) {
        instructions.push(getTransferSolInstruction({ source: feePayer, destination: mint, amount: topUp }));
    }
    for (const { field, value } of updates) {
        instructions.push(
            getUpdateTokenMetadataFieldInstruction(
                { metadata: mint, updateAuthority, field: FIELD_ARGS[field], value },
                { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
            ),
        );
    }

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};
