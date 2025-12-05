import { type Address, type TransactionModifyingSigner, isAddress } from '@solana/kit';
import { AuthorityType } from '@solana-program/token-2022';
import { getUpdateAuthorityTransaction, getRemoveAuthorityTransaction } from '@mosaic/sdk';
import { executeTokenAction } from './token-action';

export type AuthorityRole = AuthorityType | 'Metadata';

export interface UpdateAuthorityOptions {
    mint: string;
    role: AuthorityRole;
    newAuthority: string;
    rpcUrl?: string;
}

export interface UpdateAuthorityResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    authorityRole?: string;
    prevAuthority?: string;
    newAuthority?: string;
}

/**
 * Validates authority update options
 * @param options - Authority update configuration options
 * @throws Error if validation fails
 */
function validateUpdateAuthorityOptions(options: UpdateAuthorityOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }

    if (!options.newAuthority) {
        throw new Error('New authority address is required');
    }

    if (options.role === undefined || options.role === null) {
        throw new Error('Authority role is required');
    }

    // Validate Solana address format
    if (!isAddress(options.mint)) {
        throw new Error('Invalid mint address format');
    }

    if (!isAddress(options.newAuthority)) {
        throw new Error('Invalid new authority address format');
    }
}

/**
 * Updates the authority for a given mint and role
 * @param options - Configuration options for the authority update
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to update result with signature and authority details
 */
export const updateTokenAuthority = (
    options: UpdateAuthorityOptions,
    signer: TransactionModifyingSigner,
): Promise<UpdateAuthorityResult> =>
    executeTokenAction<UpdateAuthorityOptions, UpdateAuthorityResult>({
        options,
        signer,
        validate: validateUpdateAuthorityOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            getUpdateAuthorityTransaction({
                rpc,
                payer: signer,
                mint: options.mint as Address,
                role: options.role,
                currentAuthority: signer,
                newAuthority: options.newAuthority as Address,
            }),
        buildSuccessResult: (_, options, signerAddress) => ({
            authorityRole: options.role.toString(),
            prevAuthority: signerAddress,
            newAuthority: options.newAuthority,
        }),
    });

export interface RemoveAuthorityOptions {
    mint: string;
    role: AuthorityRole;
    rpcUrl?: string;
}

export interface RemoveAuthorityResult {
    success: boolean;
    error?: string;
    transactionSignature?: string;
    authorityRole?: string;
    removedAuthority?: string;
}

/**
 * Validates authority removal options
 * @param options - Authority removal configuration options
 * @throws Error if validation fails
 */
function validateRemoveAuthorityOptions(options: RemoveAuthorityOptions): void {
    if (!options.mint) {
        throw new Error('Mint address is required');
    }

    if (options.role === undefined || options.role === null) {
        throw new Error('Authority role is required');
    }

    // Validate Solana address format
    if (!isAddress(options.mint)) {
        throw new Error('Invalid mint address format');
    }
}

/**
 * Removes (revokes) the authority for a given mint and role
 * This action is irreversible - the authority will be set to None
 * @param options - Configuration options for the authority removal
 * @param signer - Transaction sending signer instance (must be current authority)
 * @returns Promise that resolves to removal result with signature and details
 */
export const removeTokenAuthority = (
    options: RemoveAuthorityOptions,
    signer: TransactionModifyingSigner,
): Promise<RemoveAuthorityResult> =>
    executeTokenAction<RemoveAuthorityOptions, RemoveAuthorityResult>({
        options,
        signer,
        validate: validateRemoveAuthorityOptions,
        buildTransaction: async ({ rpc, signer, options }) =>
            getRemoveAuthorityTransaction({
                rpc,
                payer: signer,
                mint: options.mint as Address,
                role: options.role,
                currentAuthority: signer,
            }),
        buildSuccessResult: (_, options, signerAddress) => ({
            authorityRole: options.role.toString(),
            removedAuthority: signerAddress,
        }),
    });
