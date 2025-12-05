import {
    createSolanaRpc,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    pipe,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    createSolanaRpcSubscriptions,
    TransactionModifyingSigner,
    isAddress,
    assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';
import { createUpdateFieldInstruction, createReallocateInstruction, getMintDetails } from '@mosaic/sdk';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';

export type MetadataFieldType = 'name' | 'symbol' | 'uri';

export interface MetadataUpdate {
    field: MetadataFieldType;
    value: string;
}

export interface UpdateMetadataOptions {
    mintAddress: string;
    field: MetadataFieldType;
    value: string;
    rpcUrl?: string;
}

export interface UpdateMetadataBatchOptions {
    mintAddress: string;
    updates: MetadataUpdate[];
    rpcUrl?: string;
}

export interface UpdateMetadataResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    field?: string;
    newValue?: string;
}

export interface UpdateMetadataBatchResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    updatedFields?: string[];
}

/**
 * Validates metadata update options
 * @param options - Metadata update configuration options
 * @throws Error if validation fails
 */
function validateUpdateMetadataOptions(options: UpdateMetadataOptions): void {
    if (!options.mintAddress) {
        throw new Error('Mint address is required');
    }

    if (!isAddress(options.mintAddress)) {
        throw new Error('Invalid mint address format');
    }

    if (!options.field) {
        throw new Error('Field to update is required');
    }

    if (!['name', 'symbol', 'uri'].includes(options.field)) {
        throw new Error('Invalid field. Must be name, symbol, or uri');
    }

    // Note: empty string is allowed (e.g., to clear a field)
    if (options.value == null) {
        throw new Error('Value is required (empty string is allowed)');
    }

    // Validate field-specific constraints
    if (options.field === 'name' && options.value.length > 32) {
        throw new Error('Name must be 32 characters or less');
    }
    if (options.field === 'symbol' && options.value.length > 10) {
        throw new Error('Symbol must be 10 characters or less');
    }
    if (options.field === 'uri' && options.value.length > 200) {
        throw new Error('URI must be 200 characters or less');
    }
}

/**
 * Updates token metadata (name, symbol, or URI).
 * Requires the connected wallet to be the metadata update authority.
 *
 * @param options - Configuration options for the metadata update
 * @param signer - Transaction sending signer instance (must be metadata authority)
 * @returns Promise that resolves to update result with signature and details
 */
export const updateTokenMetadata = async (
    options: UpdateMetadataOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateMetadataResult> => {
    try {
        validateUpdateMetadataOptions(options);

        const signerAddress = signer.address;
        if (!signerAddress) {
            throw new Error('Wallet not connected');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Get mint details for program address
        const { programAddress } = await getMintDetails(rpc, options.mintAddress as Address);

        // Create reallocate instruction to ensure enough space for new metadata
        const reallocateInstruction = createReallocateInstruction({
            programAddress,
            mint: options.mintAddress as Address,
            payer: signerAddress,
            owner: signerAddress,
            systemProgram: SYSTEM_PROGRAM_ADDRESS,
        });

        // Create update field instruction
        const updateInstruction = createUpdateFieldInstruction({
            programAddress,
            metadata: options.mintAddress as Address,
            updateAuthority: signerAddress,
            field: options.field,
            value: options.value,
        });

        // Get latest blockhash
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        // Create transaction with reallocate first, then update
        const transaction = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(signer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions([reallocateInstruction, updateInstruction], m),
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            field: options.field,
            newValue: options.value,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

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
 * Updates multiple token metadata fields in a single transaction.
 * Requires the connected wallet to be the metadata update authority.
 *
 * @param options - Configuration options for the batch metadata update
 * @param signer - Transaction sending signer instance (must be metadata authority)
 * @returns Promise that resolves to update result with signature and details
 */
export const updateTokenMetadataBatch = async (
    options: UpdateMetadataBatchOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateMetadataBatchResult> => {
    try {
        validateUpdateMetadataBatchOptions(options);

        const signerAddress = signer.address;
        if (!signerAddress) {
            throw new Error('Wallet not connected');
        }

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Get mint details for program address
        const { programAddress } = await getMintDetails(rpc, options.mintAddress as Address);

        // Create reallocate instruction to ensure enough space for new metadata
        const reallocateInstruction = createReallocateInstruction({
            programAddress,
            mint: options.mintAddress as Address,
            payer: signerAddress,
            owner: signerAddress,
            systemProgram: SYSTEM_PROGRAM_ADDRESS,
        });

        // Build instructions for each metadata update
        const updateInstructions = options.updates.map(({ field, value }) =>
            createUpdateFieldInstruction({
                programAddress,
                metadata: options.mintAddress as Address,
                updateAuthority: signerAddress,
                field,
                value,
            }),
        );
        const updatedFields = options.updates.map(({ field }) => field);

        // Get latest blockhash
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        // Create transaction with reallocate first, then all update instructions
        const transaction = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(signer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions([reallocateInstruction, ...updateInstructions], m),
        );

        // Sign and send the transaction
        const signedTransaction = await signTransactionMessageWithSigners(transaction);
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            updatedFields,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};
