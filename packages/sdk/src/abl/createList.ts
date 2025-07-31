import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { ABL_PROGRAM_ID } from "./utils";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';


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