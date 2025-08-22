import type { Address, Rpc, SolanaRpcApi } from 'gill';
import { createMockSigner, createMockRpc } from '../../__tests__/test-utils';
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  getInitializeMintInstruction,
  extension,
  AccountState,
  getPreInitializeInstructionsForMintExtensions,
} from 'gill/programs/token';

describe('templates enableSrfc37 option', () => {
  let rpc: Rpc<SolanaRpcApi>;
  const feePayer = createMockSigner();
  const mintAuthority = feePayer.address as Address;
  const mint = createMockSigner();

  beforeEach(() => {
    jest.clearAllMocks();
    rpc = createMockRpc();
  });

  test('arcade token: enableSrfc37 false uses default account state initialized', async () => {
    const decimals = 6;
    const { createArcadeTokenInitTransaction } = await import('../arcadeToken');
    const tx = await createArcadeTokenInitTransaction(
      rpc,
      'Name',
      'SYM',
      decimals,
      'uri',
      mintAuthority,
      mint,
      feePayer,
      undefined,
      undefined,
      undefined,
      undefined,
      false
    );

    const instructions = tx.instructions;
    expect(instructions.length).toBeGreaterThan(0);

    const expectedInit = getInitializeMintInstruction(
      {
        mint: mint.address,
        decimals,
        freezeAuthority: mintAuthority,
        mintAuthority: feePayer.address,
      },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS }
    );
    const hasInit = instructions.some(
      i =>
        i.programAddress === expectedInit.programAddress &&
        Buffer.compare(
          Buffer.from(i.data ?? []),
          Buffer.from(expectedInit.data)
        ) === 0
    );
    expect(hasInit).toBe(true);

    const defaultStateExt = extension('DefaultAccountState', {
      state: AccountState.Initialized,
    });
    const [expectedDefaultStateInit] =
      getPreInitializeInstructionsForMintExtensions(mint.address, [
        defaultStateExt,
      ]);
    const hasDefaultInitialized = instructions.some(
      i =>
        i.programAddress === expectedDefaultStateInit.programAddress &&
        Buffer.compare(
          Buffer.from(i.data ?? []),
          Buffer.from(expectedDefaultStateInit.data ?? [])
        ) === 0
    );
    expect(hasDefaultInitialized).toBe(true);
  });

  test('arcade token: enableSrfc37 true uses default account state frozen', async () => {
    const decimals = 6;
    const { createArcadeTokenInitTransaction } = await import('../arcadeToken');
    const tx = await createArcadeTokenInitTransaction(
      rpc,
      'Name',
      'SYM',
      decimals,
      'uri',
      mintAuthority,
      mint,
      feePayer,
      undefined,
      undefined,
      undefined,
      undefined,
      true
    );

    const instructions = tx.instructions;
    expect(instructions.length).toBeGreaterThan(0);

    const expectedInit = getInitializeMintInstruction(
      {
        mint: mint.address,
        decimals,
        freezeAuthority: mintAuthority,
        mintAuthority: feePayer.address,
      },
      { programAddress: TOKEN_2022_PROGRAM_ADDRESS }
    );
    const hasInit = instructions.some(
      i =>
        i.programAddress === expectedInit.programAddress &&
        Buffer.compare(
          Buffer.from(i.data ?? []),
          Buffer.from(expectedInit.data)
        ) === 0
    );
    expect(hasInit).toBe(true);

    const defaultStateExt = extension('DefaultAccountState', {
      state: AccountState.Frozen,
    });
    const [expectedDefaultStateInit] =
      getPreInitializeInstructionsForMintExtensions(mint.address, [
        defaultStateExt,
      ]);
    const hasDefaultInitialized = instructions.some(
      i =>
        i.programAddress === expectedDefaultStateInit.programAddress &&
        Buffer.compare(
          Buffer.from(i.data ?? []),
          Buffer.from(expectedDefaultStateInit.data ?? [])
        ) === 0
    );
    expect(hasDefaultInitialized).toBe(true);
  });
});
