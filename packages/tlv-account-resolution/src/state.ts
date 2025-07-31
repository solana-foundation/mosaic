import {
  TokenTransferHookAccountNotFound,
  TokenTransferHookInvalidPubkeyData,
} from './errors';
import { unpackSeeds } from './seeds';
import { unpackPubkeyData } from './pubkeyData';
import {
  type Address,
  type AccountMeta,
  getProgramDerivedAddress,
  AccountRole,
  mergeRoles,
  getAddressDecoder,
  type MaybeEncodedAccount,
} from '@solana/kit';

export async function resolveExtraMetas(
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>,
  extraMetasAddress: Address,
  previousMetas: AccountMeta[],
  instructionData: Buffer,
  programId: Address
): Promise<AccountMeta[]> {
  const account = await accountRetriever(extraMetasAddress);
  const extraAccountMetas = getExtraAccountMetas(account);
  const resolvedMetas = [...previousMetas];
  for (const extraAccountMeta of extraAccountMetas) {
    const resolvedMeta = await resolveExtraAccountMeta(
      accountRetriever,
      extraAccountMeta,
      resolvedMetas,
      instructionData,
      programId
    );
    resolvedMetas.push(resolvedMeta);
  }
  return resolvedMetas;
}

/** ExtraAccountMeta as stored by the transfer hook program */
export interface ExtraAccountMeta {
  discriminator: number;
  addressConfig: Uint8Array;
  isSigner: boolean;
  isWritable: boolean;
}

export interface ExtraAccountMetaList {
  count: number;
  extraAccounts: ExtraAccountMeta[];
}

/** Buffer layout for de/serializing a list of ExtraAccountMetaAccountData prefixed by a u32 length */
export interface ExtraAccountMetaAccountData {
  instructionDiscriminator: bigint;
  length: number;
  extraAccountsList: ExtraAccountMetaList;
}

/** Unpack an extra account metas account and parse the data into a list of ExtraAccountMetas */
export function getExtraAccountMetas(
  account: MaybeEncodedAccount<string>
): ExtraAccountMeta[] {
  if (!account.exists) {
    throw new TokenTransferHookAccountNotFound();
  }
  return unpackExtraAccountMetas(account.data);
}

export function unpackExtraAccountMetas(data: Uint8Array): ExtraAccountMeta[] {
  if (data.length < 12) {
    throw new TokenTransferHookInvalidPubkeyData();
  }
  //const discriminator = data.slice(0,8);
  const length = new DataView(data.buffer, 8, 4).getUint32(0, true);
  const count = new DataView(data.buffer, 12, 4).getUint32(0, true);
  const offset = 16;

  if (length !== count * 35 + 4) {
    throw new TokenTransferHookInvalidPubkeyData();
  }

  if (count * 35 > data.length - offset) {
    throw new TokenTransferHookInvalidPubkeyData();
  }

  const extraAccounts = [];
  for (let i = 0; i < count; i++) {
    const extraAccount = data.slice(offset + i * 35, offset + (i + 1) * 35);
    extraAccounts.push(unpackExtraAccountMeta(extraAccount));
  }

  return extraAccounts;
}

export function unpackExtraAccountMeta(data: Uint8Array): ExtraAccountMeta {
  const discriminator = data[0];
  const addressConfig = data.slice(1, 33);
  const isSigner = data[33] === 1;
  const isWritable = data[34] === 1;
  return { discriminator, addressConfig, isSigner, isWritable };
}

/** Take an ExtraAccountMeta and construct that into an actual AccountMeta */
export async function resolveExtraAccountMeta(
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>,
  extraMeta: ExtraAccountMeta,
  previousMetas: AccountMeta[],
  instructionData: Buffer,
  programId: Address
): Promise<AccountMeta> {
  if (extraMeta.discriminator === 0) {
    return {
      address: getAddressDecoder().decode(extraMeta.addressConfig),
      role: flagsToRole(extraMeta.isSigner, extraMeta.isWritable),
    };
  } else if (extraMeta.discriminator === 2) {
    const pubkey = await unpackPubkeyData(
      extraMeta.addressConfig,
      previousMetas,
      instructionData,
      accountRetriever
    );
    return {
      address: pubkey,
      role: flagsToRole(extraMeta.isSigner, extraMeta.isWritable),
    };
  }

  let seedProgramId: Address =
    '11111111111111111111111111111111' as Address<'11111111111111111111111111111111'>;

  if (extraMeta.discriminator === 1) {
    seedProgramId = programId;
  } else {
    const accountIndex = extraMeta.discriminator - (1 << 7);
    if (previousMetas.length <= accountIndex) {
      throw new TokenTransferHookAccountNotFound();
    }
    seedProgramId = previousMetas[accountIndex].address;
  }

  const seeds = await unpackSeeds(
    extraMeta.addressConfig,
    previousMetas,
    instructionData,
    accountRetriever
  );

  const address = await getProgramDerivedAddress({
    programAddress: seedProgramId,
    seeds,
  });

  return {
    address: address[0],
    role: flagsToRole(extraMeta.isSigner, extraMeta.isWritable),
  };
}

function flagsToRole(isSigner: boolean, isWritable: boolean): AccountRole {
  const signerRole = isSigner
    ? AccountRole.READONLY_SIGNER
    : AccountRole.READONLY;
  const writableRole = isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
  return mergeRoles(signerRole, writableRole);
}
