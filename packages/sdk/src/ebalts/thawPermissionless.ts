import { createTransaction, fetchEncodedAccount, generateKeyPairSigner, lamports, type Address, type FullTransaction, type Instruction, type Rpc, type SolanaRpcApi, type TransactionMessageWithFeePayer, type TransactionSigner, type TransactionVersion, type TransactionWithBlockhashLifetime } from "gill";
import { findListConfigPda, getInitializeListConfigInstruction, Mode } from '@mosaic/abl';
import { ABL_PROGRAM_ID, getCreateListInstructions } from "../abl";
import { createThawPermissionlessInstructionWithExtraMetas, findMintConfigPda, getCreateConfigInstruction, getSetGatingProgramInstruction } from "@mosaic/ebalts";
import { EBALTS_PROGRAM_ID } from "./utils";
import { getTokenEncoder, AccountState, TOKEN_2022_PROGRAM_ADDRESS, AuthorityType } from "gill/programs";


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
          let data = getTokenEncoder().encode({
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