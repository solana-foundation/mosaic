import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { ABL_PROGRAM_ID } from "./utils";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';


/**
 * Generates instructions for creating a new allowlist/blocklist configuration.
 * 
 * This function creates the necessary instructions to initialize a list configuration
 * that can be used for gating token operations. The list can be configured as either
 * an allowlist or blocklist depending on the mode.
 * 
 * @param input - Configuration parameters for list creation
 * @param input.authority - The authority signer who will control the list configuration
 * @returns Promise containing the instructions and the list configuration address
 */
export const getCreateListInstructions = async (input: {
    authority: TransactionSigner<string>;
  }): Promise<{instructions: Instruction<string>[], listConfig: Address}> => {
    const seed = await generateKeyPairSigner();

    const listConfigPda = await findListConfigPda({ authority: input.authority.address, seed: seed.address }, { programAddress: ABL_PROGRAM_ID });
    

    const createListInstruction = getInitializeListConfigInstruction({
      authority: input.authority,
      listConfig: listConfigPda[0],
      mode: Mode.AllowWithPermissionlessEOAs,
      seed: seed.address,
    },
    { programAddress: ABL_PROGRAM_ID });

    return {
        instructions: [createListInstruction],
        listConfig: listConfigPda[0],
    };
}

/**
 * Creates a complete transaction for initializing a new allowlist/blocklist configuration.
 * 
 * This function builds a full transaction that can be signed and sent to create
 * a list configuration. The transaction includes the necessary instructions and
 * uses the latest blockhash for proper transaction construction.
 * 
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who will control the list configuration
 * @returns Promise containing the full transaction and the list configuration address
 */
export const getCreateListTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
  }): Promise<{
    transaction: FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>, 
    listConfig: Address}> => {

    const {instructions, listConfig} = await getCreateListInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return {
        transaction,
        listConfig,
    };
}