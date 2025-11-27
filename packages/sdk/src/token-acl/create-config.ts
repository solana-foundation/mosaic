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
import { findMintConfigPda, getCreateConfigInstruction } from '@token-acl/sdk';
import { TOKEN_ACL_PROGRAM_ID } from './utils';

/**
 * Generates instructions for creating a new Token ACL mint configuration.
 *
 * This function creates the necessary instructions to initialize a mint configuration
 * for the Token ACL program. This configuration enables enhanced balance features like
 * gating programs and permissionless thaw operations for a specific mint.
 *
 * @param input - Configuration parameters for Token ACL mint config creation
 * @param input.authority - The authority signer who will control the mint configuration
 * @param input.mint - The mint address for which to create the configuration
 * @param input.gatingProgram - The program address that will gate operations on this mint
 * @param input.payer - Optional payer signer for the instruction. Defaults to authority.address if not provided
 * @returns Promise containing the instructions and the mint configuration address
 */
export const getCreateConfigInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
    payer?: TransactionSigner<string>;
}): Promise<{ instructions: Instruction<string>[]; mintConfig: Address }> => {
    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: TOKEN_ACL_PROGRAM_ID });

    const payer = input.payer?.address ?? input.authority.address;

    const createConfigInstruction = getCreateConfigInstruction(
        {
            payer,
            authority: input.authority,
            mint: input.mint,
            mintConfig: mintConfigPda[0],
            gatingProgram: input.gatingProgram,
        },
        { programAddress: TOKEN_ACL_PROGRAM_ID },
    );

    return {
        instructions: [createConfigInstruction],
        mintConfig: mintConfigPda[0],
    };
};

/**
 * Creates a complete transaction for initializing a new Token ACL mint configuration.
 *
 * This function builds a full transaction that can be signed and sent to create
 * an Token ACL mint configuration. The transaction includes the necessary instructions
 * and uses the latest blockhash for proper transaction construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who will control the mint configuration
 * @param input.mint - The mint address for which to create the configuration
 * @param input.gatingProgram - The program address that will gate operations on this mint
 * @returns Promise containing the full transaction and the mint configuration address
 */
export const getCreateConfigTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
}): Promise<{
    transaction: FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>;
    mintConfig: Address;
}> => {
    const { instructions, mintConfig } = await getCreateConfigInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return {
        transaction,
        mintConfig,
    };
};
