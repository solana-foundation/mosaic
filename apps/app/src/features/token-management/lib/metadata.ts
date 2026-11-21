import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createUpdateMetadataTransaction } from '@solana/mosaic-sdk';
import { executeTokenAction } from './token-action';

export type MetadataFieldType = 'name' | 'symbol' | 'uri';

export interface MetadataUpdate {
    field: MetadataFieldType;
    value: string;
}

export interface UpdateMetadataBatchOptions {
    mintAddress: string;
    updates: MetadataUpdate[];
    rpcUrl?: string;
}

export interface UpdateMetadataBatchResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    updatedFields?: string[];
}

/**
 * Validates a single metadata update entry
 * @param update - Single metadata field update
 * @throws Error if validation fails
 */
function validateMetadataUpdate(update: MetadataUpdate): void {
    const validFields: MetadataFieldType[] = ['name', 'symbol', 'uri'];
    if (!validFields.includes(update.field)) {
        throw new Error(`Invalid field "${update.field}". Must be name, symbol, or uri`);
    }

    // Note: empty string is allowed (e.g., to clear a field)
    if (update.value == null) {
        throw new Error(`Value is required for field "${update.field}" (empty string is allowed)`);
    }

    if (update.field === 'name' && update.value.length > 32) {
        throw new Error('Name must be 32 characters or less');
    }
    if (update.field === 'symbol' && update.value.length > 10) {
        throw new Error('Symbol must be 10 characters or less');
    }
    if (update.field === 'uri' && update.value.length > 200) {
        throw new Error('URI must be 200 characters or less');
    }
}

/**
 * Validates batch metadata update options
 * @param options - Batch metadata update configuration options
 * @throws Error if validation fails
 */
function validateUpdateMetadataBatchOptions(options: UpdateMetadataBatchOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    if (!options.updates || options.updates.length === 0) {
        throw new Error('At least one field must be provided');
    }

    for (const update of options.updates) {
        validateMetadataUpdate(update);
    }
}

/**
 * Updates multiple token metadata fields in a single transaction. The connected wallet signs as
 * both the metadata update authority and the fee payer, and pays any extra rent the mint needs
 * when the metadata grows.
 *
 * @param options - Configuration options for the batch metadata update
 * @param signer - Transaction signer for the connected wallet (must be the metadata update authority)
 * @returns Promise that resolves to update result with signature and details
 */
export const updateTokenMetadataBatch = (
    options: UpdateMetadataBatchOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateMetadataBatchResult> =>
    executeTokenAction<UpdateMetadataBatchOptions, UpdateMetadataBatchResult>({
        options,
        signer,
        validate: validateUpdateMetadataBatchOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            createUpdateMetadataTransaction(rpc, {
                mint: options.mintAddress as Address,
                updateAuthority: signer,
                feePayer: signer,
                updates: options.updates,
            }),
        buildSuccessResult: (_, options) => ({
            updatedFields: options.updates.map(({ field }) => field),
        }),
    });
