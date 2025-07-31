import { createTransaction, fetchEncodedAccount, lamports, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { createThawPermissionlessInstructionWithExtraMetas, findMintConfigPda } from "@mosaic/ebalts";
import { EBALTS_PROGRAM_ID } from "./utils";
import { getTokenEncoder, AccountState, TOKEN_2022_PROGRAM_ADDRESS } from "gill/programs";


/**
 * Generates instructions for performing a permissionless thaw operation on a token account.
 * 
 * This function creates instructions to thaw a frozen token account without requiring
 * the freeze authority's signature. This is only possible if permissionless thaw has
 * been enabled for the mint. The function includes logic to handle extra accounts resolution
 * that may be required to perform the thaw.
 * 
 * @param input - Configuration parameters for the permissionless thaw operation
 * @param input.rpc - The Solana RPC client instance for fetching account data
 * @param input.authority - The authority signer performing the thaw operation
 * @param input.mint - The mint address of the token being thawed
 * @param input.tokenAccount - The token account address to thaw
 * @param input.tokenAccountOwner - The owner of the token account
 * @returns Promise containing the instructions for the permissionless thaw operation
 */
export const getThawPermissionlessInstructions = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    authority: TransactionSigner<string>;
    mint: Address;
    tokenAccount: Address;
    tokenAccountOwner: Address;
  }): Promise<Instruction<string>[]> => {

    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: EBALTS_PROGRAM_ID });

    const thawPermissionlessInstruction = await createThawPermissionlessInstructionWithExtraMetas(input.authority, input.tokenAccount, input.mint, mintConfigPda[0], input.tokenAccountOwner, EBALTS_PROGRAM_ID,
        async (address: Address) => {
          const data = getTokenEncoder().encode({
            amount: 0,
            closeAuthority: null,
            delegate: null,
            delegatedAmount: 0,
            extensions: null,
            isNative: null,
            mint: input.mint,
            owner: input.tokenAccountOwner,
            state: AccountState.Frozen
          });

          if (address === input.tokenAccount) {
            return {
              exists: true,
              address,
              data: new Uint8Array(data),
              executable: false,
              lamports: lamports(BigInt(2157600)),
              programAddress: TOKEN_2022_PROGRAM_ADDRESS,
              space: BigInt(data.byteLength),
            }
          }
          return await fetchEncodedAccount(input.rpc, address)
        }
      );

    return [thawPermissionlessInstruction];
}

/**
 * Creates a complete transaction for performing a permissionless thaw operation.
 * 
 * This function builds a full transaction that can be signed and sent to thaw
 * a frozen token account without requiring the freeze authority's signature.
 * The transaction includes the necessary instructions and uses the latest
 * blockhash for proper construction.
 * 
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer performing the thaw operation
 * @param input.mint - The mint address of the token being thawed
 * @param input.tokenAccount - The token account address to thaw
 * @param input.tokenAccountOwner - The owner of the token account
 * @returns Promise containing the full transaction for the permissionless thaw operation
 */
export const getThawPermissionlessTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    tokenAccount: Address;
    tokenAccountOwner: Address;
  }): Promise<FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>> => {

    const instructions = await getThawPermissionlessInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
}