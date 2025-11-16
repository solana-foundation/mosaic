import {
    AuthorityType,
    getSetAuthorityInstruction,
    getUpdateTokenMetadataUpdateAuthorityInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import type {
    Address,
    Instruction,
    FullTransaction,
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionSigner,
    Rpc,
    SolanaRpcApi,
    TransactionWithBlockhashLifetime,
} from 'gill';
import { createTransaction, none } from 'gill';

type AuthorityRole = AuthorityType | 'Metadata';

/**
 * Returns the appropriate instruction(s) to update the authority for a given mint and role.
 *
 * If the role is 'Metadata', this will return an instruction to update the metadata update authority.
 * Otherwise, it returns a set authority instruction for the specified authority type.
 *
 * @param input - The parameters for the authority update.
 * @param input.mint - The address of the mint whose authority is being updated.
 * @param input.role - The authority role to update ('Metadata' or an AuthorityType).
 * @param input.currentAuthority - The current authority signer.
 * @param input.newAuthority - The new authority address.
 * @returns An array containing the instruction to update the authority.
 */
export const getUpdateAuthorityInstructions = (input: {
    mint: Address;
    role: AuthorityRole;
    currentAuthority: TransactionSigner<string>;
    newAuthority: Address;
}): Instruction<string>[] => {
    if (input.role === 'Metadata') {
        return [
            getUpdateTokenMetadataUpdateAuthorityInstruction(
                {
                    metadata: input.mint,
                    updateAuthority: input.currentAuthority,
                    newUpdateAuthority: input.newAuthority,
                },
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                },
            ),
        ];
    }
    return [
        getSetAuthorityInstruction({
            owned: input.mint,
            owner: input.currentAuthority,
            newAuthority: input.newAuthority,
            authorityType: input.role,
        }),
    ];
};

/**
 * Returns the appropriate instruction(s) to remove the authority for a given mint and role.
 *
 * If the role is 'Metadata', this will return an instruction to remove the metadata update authority.
 * Otherwise, it returns a set authority instruction for the specified authority type.
 *
 * @param input - The parameters for the authority removal.
 * @param input.mint - The address of the mint whose authority is being removed.
 * @param input.role - The authority role to remove ('Metadata' or an AuthorityType).
 * @param input.currentAuthority - The current authority signer.
 * @returns An array containing the instruction to remove the authority.
 */
export const getRemoveAuthorityInstructions = (input: {
    mint: Address;
    role: AuthorityRole;
    currentAuthority: TransactionSigner<string>;
}): Instruction<string>[] => {
    if (input.role === 'Metadata') {
        return [
            getUpdateTokenMetadataUpdateAuthorityInstruction(
                {
                    metadata: input.mint,
                    updateAuthority: input.currentAuthority,
                    newUpdateAuthority: none(),
                },
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                },
            ),
        ];
    }
    return [
        getSetAuthorityInstruction({
            owned: input.mint,
            owner: input.currentAuthority,
            newAuthority: none(),
            authorityType: input.role,
        }),
    ];
};

/**
 * Creates a transaction to update the authority for a given mint and role.
 *
 * This function fetches the latest blockhash, builds the appropriate instruction(s)
 * using `getUpdateAuthorityInstructions`, and returns a full transaction ready to be signed and sent.
 *
 * @param input - The parameters for the authority update transaction.
 * @param input.rpc - The Solana RPC client.
 * @param input.payer - The transaction fee payer.
 * @param input.mint - The address of the mint whose authority is being updated.
 * @param input.role - The authority role to update ('Metadata' or an AuthorityType).
 * @param input.currentAuthority - The current authority signer.
 * @param input.newAuthority - The new authority address.
 * @returns A promise that resolves to the constructed full transaction.
 */
export const getUpdateAuthorityTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    mint: Address;
    role: AuthorityRole;
    currentAuthority: TransactionSigner<string>;
    newAuthority: Address;
}): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const instructions = getUpdateAuthorityInstructions({
        mint: input.mint,
        role: input.role,
        currentAuthority: input.currentAuthority,
        newAuthority: input.newAuthority,
    });
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();

    return createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
};

/**
 * Creates a transaction to remove the authority for a given mint and role.
 *
 * This function fetches the latest blockhash, builds the appropriate instruction(s)
 * using `getRemoveAuthorityInstructions`, and returns a full transaction ready to be signed and sent.
 *
 * @param input - The parameters for the authority removal transaction.
 * @param input.rpc - The Solana RPC client.
 * @param input.payer - The transaction fee payer.
 * @param input.mint - The address of the mint whose authority is being updated.
 * @param input.role - The authority role to update ('Metadata' or an AuthorityType).
 * @param input.currentAuthority - The current authority signer.
 * @returns A promise that resolves to the constructed full transaction.
 */
export const getRemoveAuthorityTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    mint: Address;
    role: AuthorityRole;
    currentAuthority: TransactionSigner<string>;
}): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const instructions = getRemoveAuthorityInstructions({
        mint: input.mint,
        role: input.role,
        currentAuthority: input.currentAuthority,
    });
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();

    return createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
};
