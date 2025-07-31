import { createTransaction, generateKeyPairSigner, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';
import { ABL_PROGRAM_ID, getCreateListInstructions } from "../abl";
import { findMintConfigPda, getCreateConfigInstruction, getSetGatingProgramInstruction, getTogglePermissionlessInstructionsInstruction } from "@mosaic/ebalts";
import { EBALTS_PROGRAM_ID } from "./utils";


export const getEnablePermissionlessThawInstructions = async (input: {
    authority: TransactionSigner<string>;
    mint: Address;
  }): Promise<Instruction<string>[]> => {

    const mintConfigPda = await findMintConfigPda({ mint: input.mint }, { programAddress: EBALTS_PROGRAM_ID });

    const enablePermissionlessThawInstruction = getTogglePermissionlessInstructionsInstruction({
        authority: input.authority,
        mintConfig: mintConfigPda[0],
        thawEnabled: true,
        freezeEnabled: false,
      },
      { programAddress: EBALTS_PROGRAM_ID });

    return [enablePermissionlessThawInstruction];
}

export const getEnablePermissionlessThawTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    mint: Address;
  }): Promise<FullTransaction<
        TransactionVersion,
        TransactionMessageWithFeePayer,
        TransactionWithBlockhashLifetime>> => {

    const instructions = await getEnablePermissionlessThawInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
}