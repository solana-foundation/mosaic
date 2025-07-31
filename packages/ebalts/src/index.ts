import {
  type Address,
  type Instruction,
  type TransactionSigner,
  AccountRole,
  type AccountMeta,
  type MaybeEncodedAccount,
} from '@solana/kit';
import { findMintConfigPda } from './generated/pdas/mintConfig';
import {
  findFreezeExtraMetasAccountPda,
  findThawExtraMetasAccountPda,
  getFreezePermissionlessInstruction,
  getMintConfigDecoder,
  getThawPermissionlessInstruction,
} from './generated';
import { resolveExtraMetas } from '@mosaic/tlv-account-resolution';

export * from './generated';

export async function createThawPermissionlessInstructionWithExtraMetas(
  authority: TransactionSigner,
  tokenAccount: Address,
  mint: Address,
  mintConfig: Address,
  tokenAccountOwner: Address,
  programAddress: Address,
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>
): Promise<Instruction> {
  const mintConfigPda = await findMintConfigPda({ mint }, { programAddress });
  const mintConfigAccount = await accountRetriever(mintConfigPda[0]);
  if (!mintConfigAccount.exists) {
    throw new Error('Mint config account not found');
  }
  const mintConfigData = getMintConfigDecoder().decode(mintConfigAccount.data);

  const thawExtraMetas = await findThawExtraMetasAccountPda(
    { mint },
    { programAddress: mintConfigData.gatingProgram }
  );

  console.log(mintConfigData);
  console.log(thawExtraMetas[0]);

  const canThawPermissionlessInstruction = getCanThawPermissionlessAccountMetas(
    authority.address,
    tokenAccount,
    mint,
    tokenAccountOwner,
    thawExtraMetas[0]
  );

  const thawAccountInstruction = getThawPermissionlessInstruction(
    {
      authority,
      tokenAccount,
      mint,
      mintConfig,
      tokenAccountOwner,
      gatingProgram: mintConfigData.gatingProgram,
    },
    {
      programAddress,
    }
  );

  const metas = await resolveExtraMetas(
    accountRetriever,
    thawExtraMetas[0],
    canThawPermissionlessInstruction,
    Buffer.from(thawAccountInstruction.data),
    mintConfigData.gatingProgram
  );

  const ix = {
    ...thawAccountInstruction,
    accounts: [...thawAccountInstruction.accounts!, ...metas.slice(4)],
  };
  return ix;
}

function getCanThawPermissionlessAccountMetas(
  authority: Address,
  tokenAccount: Address,
  mint: Address,
  owner: Address,
  extraMetasThaw: Address
): AccountMeta[] {
  return [
    { address: authority, role: AccountRole.READONLY },
    { address: tokenAccount, role: AccountRole.READONLY },
    { address: mint, role: AccountRole.READONLY },
    { address: owner, role: AccountRole.READONLY },
    { address: extraMetasThaw, role: AccountRole.READONLY },
  ];
}

export async function createFreezePermissionlessInstructionWithExtraMetas(
  authority: TransactionSigner,
  tokenAccount: Address,
  mint: Address,
  mintConfig: Address,
  tokenAccountOwner: Address,
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>
): Promise<Instruction> {
  const mintConfigPda = await findMintConfigPda({ mint });
  const mintConfigAccount = await accountRetriever(mintConfigPda[0]);
  if (!mintConfigAccount.exists) {
    throw new Error('Mint config account not found');
  }
  const mintConfigData = getMintConfigDecoder().decode(mintConfigAccount.data);

  const freezeExtraMetas = await findFreezeExtraMetasAccountPda(
    { mint },
    { programAddress: mintConfigData.gatingProgram }
  );

  const freezeAccountInstruction = getFreezePermissionlessInstruction({
    authority,
    tokenAccount,
    mint,
    mintConfig,
    tokenAccountOwner,
    gatingProgram: mintConfigData.gatingProgram,
  });

  const metas = await resolveExtraMetas(
    accountRetriever,
    freezeExtraMetas[0],
    freezeAccountInstruction.accounts,
    Buffer.from(freezeAccountInstruction.data),
    mintConfigData.gatingProgram
  );

  const ix = {
    ...freezeAccountInstruction,
    accounts: metas,
  };
  return ix;
}
