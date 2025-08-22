import type { Address, Rpc, TransactionSigner } from 'gill';
import { TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs';

/**
 * Creates a mock RPC client for testing
 */
export function createMockRpc(): Rpc<any> {
  const accountInfoRegistry = new Map<
    string,
    { owner?: Address; jsonParsed?: string; base64?: string }
  >();
  const programAccountsRegistry = new Map<
    string,
    Array<{ pubkey: Address; dataBase64: string }>
  >();

  const rpc: any = {
    __registry: { accountInfoRegistry, programAccountsRegistry },
    getMinimumBalanceForRentExemption: (_space: bigint) => ({
      send: () => Promise.resolve(2039280n),
    }),
    getLatestBlockhash: () => ({
      send: () =>
        Promise.resolve({
          value: {
            blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
            lastValidBlockHeight: 12345678,
          },
        }),
    }),
    getAccountInfo: (
      address: Address,
      opts: { encoding: 'jsonParsed' | 'base64' }
    ) => ({
      send: async () => {
        const entry = accountInfoRegistry.get(address as string);
        if (!entry) return { value: null };
        const owner = entry.owner;
        if (opts?.encoding === 'jsonParsed') {
          return entry.jsonParsed
            ? { value: { data: { parsed: { info: entry.jsonParsed } }, owner } }
            : { value: null };
        }
        if (opts?.encoding === 'base64') {
          return entry.base64
            ? { value: { data: [entry.base64, 'base64'], owner } }
            : { value: null };
        }
        return { value: null };
      },
    }),
    getProgramAccounts: (programAddress: Address, _opts?: any) => ({
      send: async () => {
        const entries =
          programAccountsRegistry.get(programAddress as string) || [];
        return entries.map(e => ({
          pubkey: e.pubkey,
          account: { data: [e.dataBase64, 'base64'] },
        }));
      },
    }),
  };

  return rpc as Rpc<any>;
}

/**
 * Creates a mock transaction signer for testing
 */
export function createMockSigner(address?: string): TransactionSigner<string> {
  const mockAddress = address || 'HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj'; // Valid SOL mint address
  return {
    address: mockAddress as Address,
    sign: () => Promise.resolve(new Uint8Array(64)),
  } as unknown as TransactionSigner<string>;
}

/**
 * Generates a mock Solana address for testing
 */
export function generateMockAddress(): string {
  return 'sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v'; // Valid base58 address
}

/**
 * Creates a Map with test metadata
 */
export function createTestAdditionalMetadata(): Map<string, string> {
  const metadata = new Map<string, string>();
  metadata.set('description', 'Test token description');
  metadata.set('website', 'https://example.com');
  return metadata;
}

/**
 * Test metadata object
 */
export const TEST_METADATA = {
  name: 'Test Token',
  symbol: 'TEST',
  uri: 'https://example.com/metadata.json',
};

/**
 * Mock authority address
 */
export const TEST_AUTHORITY =
  'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as Address;

/**
 * Resets all seeded data on a mock RPC created by createMockRpc.
 */
export function resetMockRpc(rpc: Rpc<any>): void {
  const reg = (rpc as any).__registry;
  if (!reg) return;
  reg.accountInfoRegistry.clear();
  reg.programAccountsRegistry.clear();
}

/**
 * Seeds jsonParsed mint details at getAccountInfo for the given address.
 */
export function seedMintDetails(
  rpc: Rpc<any>,
  input: {
    address: Address;
    decimals: number;
    freezeAuthority?: Address;
    mintAuthority?: Address;
    extensions?: any[];
  }
): void {
  const reg = (rpc as any).__registry;
  reg.accountInfoRegistry.set(input.address as string, {
    owner: TOKEN_2022_PROGRAM_ADDRESS,
    jsonParsed: {
      decimals: input.decimals,
      freezeAuthority: input.freezeAuthority,
      mintAuthority: input.mintAuthority,
      extensions: input.extensions ?? [],
    },
  });
}

/**
 * Seeds a token account (ATA) jsonParsed info.
 */
export function seedTokenAccount(
  rpc: Rpc<any>,
  input: {
    address: Address;
    mint: Address;
    owner?: Address;
    state?: 'initialized' | 'frozen';
    amount?: string;
  }
): void {
  const reg = (rpc as any).__registry;
  reg.accountInfoRegistry.set(input.address as string, {
    owner: TOKEN_2022_PROGRAM_ADDRESS,
    jsonParsed: {
      mint: input.mint,
      owner:
        input.owner ?? ('OwnerMock11111111111111111111111111111111' as Address),
      tokenAmount: { amount: input.amount ?? '0' },
      state:
        (input.state ?? 'initialized') === 'frozen' ? 'frozen' : 'initialized',
    },
  });
}

/**
 * Seeds a base64 program account entry for getProgramAccounts.
 * Pass already-encoded base64 data.
 */
export function seedProgramAccountBase64(
  rpc: Rpc<any>,
  programAddress: Address,
  entry: { pubkey: Address; dataBase64: string }
): void {
  const reg = (rpc as any).__registry;
  const arr = reg.programAccountsRegistry.get(programAddress as string) || [];
  arr.push(entry);
  reg.programAccountsRegistry.set(programAddress as string, arr);
}
