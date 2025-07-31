import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { ABL_PROGRAM_ID } from "./utils";
import { getSetExtraMetasThawInstruction } from '@mosaic/abl';
import { findMintConfigPda, findThawExtraMetasAccountPda } from '@mosaic/ebalts';
import { EBALTS_PROGRAM_ID } from "../ebalts";


export const getSetExtraMetasInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    list: Address;
  }): Promise<Instruction<string>[]> => {
    
    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: EBALTS_PROGRAM_ID });
    const extraMetasThaw = await findThawExtraMetasAccountPda({ mint: input.mint }, { programAddress: ABL_PROGRAM_ID });
    

    const createListInstruction = getSetExtraMetasThawInstruction({
      authority: input.authority,
      listConfig: input.list,
      mint: input.mint,
      ebaltsMintConfig: mintConfigPda[0],
      extraMetasThaw: extraMetasThaw[0],
    },
    { programAddress: ABL_PROGRAM_ID });
    
    return [createListInstruction];
}

export const getSetExtraMetasTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    list: Address;
  }): Promise<FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>> => {
        
    const instructions = await getSetExtraMetasInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
}