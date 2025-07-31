import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';
import { ABL_PROGRAM_ID, getCreateListInstructions } from "../abl";
import { findMintConfigPda, getCreateConfigInstruction } from "@mosaic/ebalts";
import { EBALTS_PROGRAM_ID } from "./utils";


export const getCreateConfigInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
  }): Promise<{instructions: Instruction<string>[], mintConfig: Address}> => {

    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: EBALTS_PROGRAM_ID });

    const createConfigInstruction = getCreateConfigInstruction({
        payer: input.authority.address,
        authority: input.authority,
        mint: input.mint,
        mintConfig: mintConfigPda[0],
        gatingProgram: input.gatingProgram,
      },
      { programAddress: EBALTS_PROGRAM_ID });

    return {
        instructions: [createConfigInstruction],
        mintConfig: mintConfigPda[0],
    };
}

export const getCreateConfigTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
  }): Promise<{
    transaction: FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>, 
    mintConfig: Address}> => {

    const {instructions, mintConfig} = await getCreateConfigInstructions(input);
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
}