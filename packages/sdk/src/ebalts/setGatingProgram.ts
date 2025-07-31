import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';
import { ABL_PROGRAM_ID, getCreateListInstructions } from "../abl";
import { findMintConfigPda, getCreateConfigInstruction, getSetGatingProgramInstruction } from "@mosaic/ebalts";
import { EBALTS_PROGRAM_ID } from "./utils";


export const getSetGatingProgramInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
  }): Promise<Instruction<string>[]> => {

    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: EBALTS_PROGRAM_ID });
    const gatingProgram = (input.gatingProgram || '11111111111111111111111111111111') as Address;

    const setGatingProgramInstruction = getSetGatingProgramInstruction({
        authority: input.authority,
        mintConfig: mintConfigPda[0],
        newGatingProgram: gatingProgram,
      },
      { programAddress: EBALTS_PROGRAM_ID });

    return [setGatingProgramInstruction];
}

export const getSetGatingProgramTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
    gatingProgram: Address;
  }): Promise<FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>> => {

    const instructions = await getSetGatingProgramInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
}