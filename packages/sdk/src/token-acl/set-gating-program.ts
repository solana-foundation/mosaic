import {
    createTransaction,
    type Address,
    type FullTransaction,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionMessageWithFeePayer,
    type TransactionSigner,
    type TransactionVersion,
    type TransactionWithBlockhashLifetime,
} from 'gill';
import { findMintConfigPda, getSetGatingProgramInstruction } from '@token-acl/sdk';
import { TOKEN_ACL_PROGRAM_ID } from './utils';

/**
 * Generates instructions for setting or updating the gating program for a mint.
 *
 * This function creates instructions to configure which program will gate operations
 * on a specific mint. The gating program controls access to the permissionless thaw functionality.
 * If no gating program is provided, it defaults to the System Program (11111111111111111111111111111111).
 *
 * @param input - Configuration parameters for setting the gating program
 * @param input.authority - The authority signer who can modify the gating configuration
 * @param input.mint - The mint address for which to set the gating program
 * @param input.gatingProgram - The program address that will gate operations on this mint
 * @returns Promise containing the instructions for setting the gating program
 */
export const getSetGatingProgramInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
}): Promise<Instruction<string>[]> => {
    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });
    const gatingProgram = (input.gatingProgram || '11111111111111111111111111111111') as Address;

    const setGatingProgramInstruction = getSetGatingProgramInstruction(
        {
            authority: input.authority,
            mintConfig: mintConfigPda[0],
            newGatingProgram: gatingProgram,
        },
        { programAddress: TOKEN_ACL_PROGRAM_ID },
    );

    return [setGatingProgramInstruction];
};

/**
 * Creates a complete transaction for setting or updating the gating program.
 *
 * This function builds a full transaction that can be signed and sent to configure
 * the gating program for a specific mint. The transaction includes the necessary
 * instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who can modify the gating configuration
 * @param input.mint - The mint address for which to set the gating program
 * @param input.gatingProgram - The program address that will gate operations on this mint
 * @returns Promise containing the full transaction for setting the gating program
 */
export const getSetGatingProgramTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
}): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const instructions = await getSetGatingProgramInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
};
