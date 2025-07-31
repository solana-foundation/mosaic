import {
  TokenTransferHookAccountDataNotFound,
  TokenTransferHookInvalidPubkeyData,
  TokenTransferHookPubkeyDataTooSmall,
  TokenTransferHookAccountNotFound,
} from './errors';
import {
  type Address,
  type AccountMeta,
  getAddressDecoder,
  type MaybeEncodedAccount,
} from '@solana/kit';

export async function unpackPubkeyData(
  keyDataConfig: Uint8Array,
  previousMetas: AccountMeta[],
  instructionData: Buffer,
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>
): Promise<Address> {
  const [discriminator, ...rest] = keyDataConfig;
  const remaining = new Uint8Array(rest);
  switch (discriminator) {
    case 1:
      return unpackPubkeyDataFromInstructionData(remaining, instructionData);
    case 2:
      return unpackPubkeyDataFromAccountData(
        remaining,
        previousMetas,
        accountRetriever
      );
    default:
      throw new TokenTransferHookInvalidPubkeyData();
  }
}

function unpackPubkeyDataFromInstructionData(
  remaining: Uint8Array,
  instructionData: Buffer
): Address {
  if (remaining.length < 1) {
    throw new TokenTransferHookInvalidPubkeyData();
  }
  const dataIndex = remaining[0];
  if (instructionData.length < dataIndex + 32) {
    throw new TokenTransferHookPubkeyDataTooSmall();
  }
  return getAddressDecoder().decode(instructionData, dataIndex);
  //return new PublicKey(instructionData.subarray(dataIndex, dataIndex + PUBLIC_KEY_LENGTH));
}

async function unpackPubkeyDataFromAccountData(
  remaining: Uint8Array,
  previousMetas: AccountMeta[],
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>
): Promise<Address> {
  if (remaining.length < 2) {
    throw new TokenTransferHookInvalidPubkeyData();
  }
  const [accountIndex, dataIndex] = remaining;
  if (previousMetas.length <= accountIndex) {
    throw new TokenTransferHookAccountDataNotFound();
  }
  const accountInfo = await accountRetriever(
    previousMetas[accountIndex].address
  );
  //const accountInfo = await connection.getAccountInfo();
  if (!accountInfo.exists) {
    throw new TokenTransferHookAccountNotFound();
  }
  if (accountInfo.data.length < dataIndex + 32) {
    throw new TokenTransferHookPubkeyDataTooSmall();
  }
  return getAddressDecoder().decode(accountInfo.data, dataIndex);
  //return new PublicKey(accountInfo.data.subarray(dataIndex, dataIndex + PUBLIC_KEY_LENGTH));
}
