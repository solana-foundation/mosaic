import type {
  SetGatingProgramInstruction,
  TogglePermissionlessInstructionsInstruction,
} from '@mosaic/token-acl';
import { AccountRole, type Address, type TransactionSigner } from 'gill';

export async function findMintConfigPda(): Promise<[string, string]> {
  return ['MintCfgMock1111111111111111111111111111111', 'bump'];
}
export async function getCreateConfigInstruction(): Promise<any> {
  return { __mock: 'create-config' };
}
export async function findThawExtraMetasAccountPda(): Promise<
  [string, string]
> {
  return ['ThawExtraMock111111111111111111111111111111', 'bump'];
}
export async function findFreezeExtraMetasAccountPda(): Promise<
  [string, string]
> {
  return ['FreezeExtraMock11111111111111111111111111111', 'bump'];
}

// Token ACL program address (matches utils.ts)
const TOKEN_ACL_PROGRAM_ID = '81H44JYqk1p8RUks7pNJjhQG4Pj8FcaJeTUxZKN3JfLc';

export function getFreezeInstruction(
  _args: any,
  ctx: { programAddress: string }
) {
  return {
    programAddress: ctx.programAddress ?? TOKEN_ACL_PROGRAM_ID,
    accounts: [],
    data: new Uint8Array([10]),
  };
}

export function createThawPermissionlessInstructionWithExtraMetas(
  authority: TransactionSigner<string>,
  tokenAccount: Address,
  mint: Address,
  mintConfigPda: Address,
  tokenAccountOwner: Address,
  programAddress: Address,
  _resolveExtra?: (addr: Address) => Promise<any>
) {
  return {
    programAddress,
    accounts: [
      { address: (authority.address ?? authority) as string, role: 'signer' },
      { address: tokenAccount as string },
      { address: mint as string },
      { address: mintConfigPda as string },
      { address: tokenAccountOwner as string },
    ],
    data: new Uint8Array([1]), // dummy payload
  };
}

export function getSetGatingProgramInstruction({
  authority,
  mintConfig,
}: {
  authority: TransactionSigner<string>;
  mintConfig: Address;
}): SetGatingProgramInstruction {
  const accounts = [
    {
      address: authority.address as Address,
      role: AccountRole.READONLY_SIGNER,
      signer: authority,
    },
    { address: mintConfig as Address, role: AccountRole.WRITABLE },
  ] as const;

  return {
    accounts: accounts as unknown as SetGatingProgramInstruction['accounts'],
    programAddress:
      'Eba1ts11111111111111111111111111111111111111' as Address<'Eba1ts11111111111111111111111111111111111111'>,
    data: new Uint8Array([1]),
  } as SetGatingProgramInstruction;
}

export function getTogglePermissionlessInstructionsInstruction({
  authority,
  mintConfig,
}: {
  authority: TransactionSigner<string>;
  mintConfig: Address;
}) {
  return {
    programAddress:
      'Eba1ts11111111111111111111111111111111111111' as Address<'Eba1ts11111111111111111111111111111111111111'>,
    accounts: [
      {
        address: authority.address as Address,
        role: AccountRole.READONLY_SIGNER,
        signer: authority,
      },
      { address: mintConfig as Address, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array([1]),
  } as TogglePermissionlessInstructionsInstruction;
}
