import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { createUpdateTransferHookTransaction } from '@solana/mosaic-sdk';
import { executeTokenAction } from './token-action';

export interface UpdateTransferHookOptions {
    mint: string;
    /** New hook program id, or null to detach the current program (extension stays, becomes inactive). */
    programId: string | null;
    rpcUrl?: string;
}

export interface UpdateTransferHookResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    programId?: string | null;
}

function validateUpdateTransferHookOptions(options: UpdateTransferHookOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }
    if (!isAddress(options.mint)) {
        throw new Error('Invalid mint address format');
    }
    if (options.programId !== null && !isAddress(options.programId)) {
        throw new Error('Invalid program id format');
    }
}

/**
 * Updates a mint's transfer hook program id. Pass `programId: null` to detach the
 * current program, leaving the extension present on the mint but inactive.
 */
export const updateTransferHookProgram = (
    options: UpdateTransferHookOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateTransferHookResult> =>
    executeTokenAction<UpdateTransferHookOptions, UpdateTransferHookResult>({
        options,
        signer,
        validate: validateUpdateTransferHookOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            createUpdateTransferHookTransaction(rpc, {
                mint: options.mint as Address,
                authority: signer,
                programId: options.programId as Address | null,
                feePayer: signer,
            }),
        buildSuccessResult: (_, options) => ({
            programId: options.programId,
        }),
    });
