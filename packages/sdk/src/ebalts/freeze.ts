import {
  type Address,
  createNoopSigner,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from 'gill';
import { resolveTokenAccount } from '../transactionUtil';
import { findMintConfigPda, getFreezeInstruction } from '@mosaic/ebalts';
import { TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { EBALTS_PROGRAM_ID } from '..';

export const getEbaltsFreezeInstructions = async (
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
  authority: Address | TransactionSigner<string>,
  account: Address,
  accountAta?: Address
): Promise<Instruction[]> => {
  // TODO: this should get the list of all token accounts for the provided account
  // instead we are just freezing the ata for now
  if (!accountAta) {
    const { tokenAccount: destinationAta } = await resolveTokenAccount(
      rpc,
      account,
      mint
    );
    accountAta = destinationAta;
  }
  const accountSigner =
    typeof authority === 'string' ? createNoopSigner(authority) : authority;
  const mintConfig = await findMintConfigPda(
    {
      mint,
    },
    { programAddress: EBALTS_PROGRAM_ID }
  );
  const freezeInstruction = getFreezeInstruction({
    authority: accountSigner,
    mint,
    tokenAccount: accountAta,
    mintConfig: mintConfig[0],
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  return [freezeInstruction];
};
