import type { Address, Rpc, SolanaRpcApi } from 'gill';

export const Mode = { Allow: 1, Block: 2 } as const;

export async function findListConfigPda(): Promise<[string, string]> {
  return ['ListCfgMock1111111111111111111111111111111', 'bump'];
}

// Minimal mock: return the shape that sdk/src/abl/list.ts expects
export async function fetchListConfig(
  _rpc: Rpc<SolanaRpcApi>,
  listConfig: Address
): Promise<{
  address: Address;
  data: { mode: number; seed: Address; authority: Address };
}> {
  return {
    address: listConfig,
    data: {
      mode: Mode.Block,
      seed: listConfig,
      authority: listConfig,
    },
  };
}

// Very lightweight decoders used by list.ts
export function getABWalletDecoder() {
  return {
    decode: (_data: Uint8Array) => ({
      wallet: 'WalletMock11111111111111111111111111111111' as Address,
    }),
  };
}

export function getListConfigDecoder() {
  return {
    decode: (_data: Uint8Array) => ({
      mode: Mode.Block,
      seed: 'SeedMock111111111111111111111111111111111' as Address,
      authority: 'AuthMock11111111111111111111111111111111' as Address,
    }),
  };
}

export async function findABWalletPda(): Promise<[string, string]> {
  return ['ABWalletMock111111111111111111111111111111', 'bump'];
}

export function getAddWalletToListInstruction(): any {
  return {
    programAddress: 'AblProgramMockAdd',
    accounts: [],
    data: new Uint8Array([2]),
  };
}

export function getRemoveWalletFromListInstruction(): any {
  return {
    programAddress: 'AblProgramMockRemove',
    accounts: [],
    data: new Uint8Array([3]),
  };
}

export function getInitializeListConfigInstruction() {
  return {
    programAddress: 'AblProgramMockInitialize',
    accounts: [],
    data: new Uint8Array([1]),
  };
}

export function getSetExtraMetasThawInstruction() {
  return {
    programAddress: 'AblProgramMockSetExtraMetasThaw',
    accounts: [],
    data: new Uint8Array([1]),
  };
}

export function getCreateListInstruction() {
  return {
    programAddress: 'AblProgramMockCreateList',
    accounts: [],
    data: new Uint8Array([0]),
  };
}

export function getSetupExtraMetasInstruction() {
  return {
    programAddress: 'AblProgramMockSetupExtraMetas',
    accounts: [],
    data: new Uint8Array([4]),
  };
}

export function getAddWalletInstruction() {
  return {
    programAddress: 'AblProgramMockAddWallet',
    accounts: [],
    data: new Uint8Array([5]),
  };
}

export function getRemoveWalletInstruction() {
  return {
    programAddress: 'AblProgramMockRemoveWallet',
    accounts: [],
    data: new Uint8Array([6]),
  };
}

export async function findWalletEntryPda(): Promise<[string, string]> {
  return ['WalletEntryMock11111111111111111111111111111', 'bump'];
}
