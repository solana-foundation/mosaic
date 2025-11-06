// Test imports - Jest globals are available automatically
import type {
  Address,
  Rpc,
  SolanaRpcApiMainnet,
  TransactionSigner,
} from 'gill';
import { generateKeyPairSigner } from 'gill';
import { AccountState, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs/token';
import { Token, getCreateMintInstructions } from '../index';
import {
  createMockRpc,
  createMockSigner,
  createTestAdditionalMetadata,
  TEST_METADATA,
  TEST_AUTHORITY,
  generateMockAddress,
} from '../../__tests__/test-utils';

describe('Token', () => {
  let token: Token;
  let mockRpc: Rpc<SolanaRpcApiMainnet>;
  let mockMint: TransactionSigner<string>;
  let mockFeePayer: TransactionSigner<string>;

  beforeEach(() => {
    token = new Token();
    mockRpc = createMockRpc();
    mockMint = createMockSigner('A6ivpZrUV8CrDeZpZ9UXnVbbqEBQ475KYBaM8jstSZsK');
    mockFeePayer = createMockSigner(
      '7aHo5VmQ3CXgPTr4MTEcQTAaXn5avkxwwd8g4Ryo4r9P'
    );
  });

  describe('withMetadata', () => {
    it('should add metadata extensions to the token', () => {
      const additionalMetadata = createTestAdditionalMetadata();

      const result = token.withMetadata({
        mintAddress: mockMint.address,
        authority: TEST_AUTHORITY,
        metadata: TEST_METADATA,
        additionalMetadata,
      });

      expect(result).toBe(token); // Should return the same instance for chaining
      expect(token.getExtensions()).toHaveLength(2); // MetadataPointer + TokenMetadata

      const extensions: any = token.getExtensions();
      expect(extensions[0].__kind).toBe('MetadataPointer');
      expect(extensions[1].__kind).toBe('TokenMetadata');
      expect(extensions[1].name).toBe(TEST_METADATA.name);
      expect(extensions[1].symbol).toBe(TEST_METADATA.symbol);
      expect(extensions[1].uri).toBe(TEST_METADATA.uri);
      expect(extensions[1].additionalMetadata).toBe(additionalMetadata);
    });
  });

  describe('withPermanentDelegate', () => {
    it('should add permanent delegate extension', () => {
      const result = token.withPermanentDelegate(TEST_AUTHORITY);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(1);

      const extension: any = token.getExtensions()[0];
      expect(extension.__kind).toBe('PermanentDelegate');
      expect(extension.delegate).toBe(TEST_AUTHORITY);
    });
  });

  describe('withPausable', () => {
    it('should add pausable config extension', () => {
      const result = token.withPausable(TEST_AUTHORITY);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(1);

      const extension: any = token.getExtensions()[0];
      expect(extension.__kind).toBe('PausableConfig');
      expect(extension.authority).toEqual({
        __option: 'Some',
        value: TEST_AUTHORITY,
      });
      expect(extension.paused).toBe(false);
    });
  });

  describe('withDefaultAccountState', () => {
    it('should add default account state extension with initialized state', () => {
      const result = token.withDefaultAccountState(true);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(1);

      const extension: any = token.getExtensions()[0];
      expect(extension.__kind).toBe('DefaultAccountState');
      expect(extension.state).toBe(AccountState.Initialized);
    });

    it('should add default account state extension with uninitialized state', () => {
      const result = token.withDefaultAccountState(false);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(1);

      const extension: any = token.getExtensions()[0];
      expect(extension.__kind).toBe('DefaultAccountState');
      expect(extension.state).toBe(AccountState.Frozen);
    });
  });

  describe('withConfidentialBalances', () => {
    it('should add confidential balances extension', () => {
      const result = token.withConfidentialBalances(TEST_AUTHORITY);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(1);

      const extension: any = token.getExtensions()[0];
      expect(extension.__kind).toBe('ConfidentialTransferMint');
      expect(extension.authority).toEqual({
        __option: 'Some',
        value: TEST_AUTHORITY,
      });
      expect(extension.autoApproveNewAccounts).toBe(false);
      expect(extension.auditorElgamalPubkey).toBe(null);
    });
  });

  describe('method chaining', () => {
    it('should allow chaining multiple extensions', () => {
      const additionalMetadata = createTestAdditionalMetadata();

      const result = token
        .withMetadata({
          mintAddress: mockMint.address,
          authority: TEST_AUTHORITY,
          metadata: TEST_METADATA,
          additionalMetadata,
        })
        .withPermanentDelegate(TEST_AUTHORITY)
        .withPausable(TEST_AUTHORITY);

      expect(result).toBe(token);
      expect(token.getExtensions()).toHaveLength(4); // 2 from metadata + 1 + 1
    });
  });

  describe('buildInstructions', () => {
    it('should build instructions for token with extensions', async () => {
      const mintAuthority = await generateKeyPairSigner();
      const additionalMetadata = createTestAdditionalMetadata();

      token.withMetadata({
        mintAddress: mockMint.address,
        authority: mintAuthority.address,
        metadata: TEST_METADATA,
        additionalMetadata,
      });

      const instructions = await token.buildInstructions({
        rpc: mockRpc,
        decimals: 6,
        mintAuthority: mintAuthority,
        mint: mockMint,
        feePayer: mockFeePayer,
      });

      expect(instructions).toHaveLength(4); // create + pre-init + init + post-init
      expect(instructions[0].programAddress).toBe(
        '11111111111111111111111111111111'
      ); // System program for account creation
      expect(instructions[instructions.length - 1].programAddress).toBe(
        TOKEN_2022_PROGRAM_ADDRESS
      ); // Token program for mint init
    });

    it('should build instructions for token without extensions', async () => {
      const instructions = await token.buildInstructions({
        rpc: mockRpc,
        decimals: 9,
        mintAuthority: TEST_AUTHORITY,
        mint: mockMint,
        feePayer: mockFeePayer,
      });

      expect(instructions).toHaveLength(2); // create + init (no pre/post init for no extensions)
    });
  });

  describe('buildTransaction', () => {
    it('should build a complete transaction', async () => {
      const transaction = await token.buildTransaction({
        rpc: mockRpc,
        decimals: 6,
        mintAuthority: TEST_AUTHORITY,
        mint: mockMint,
        feePayer: mockFeePayer,
      });

      expect(transaction).toBeDefined();
      expect(transaction.version).toBe('legacy');
      expect(transaction.feePayer.address).toBe(mockFeePayer);
      expect(transaction.instructions.length).toBeGreaterThan(0);
    });
  });
});

describe('getCreateMintInstructions', () => {
  let mockRpc: Rpc<any>;
  let mockMint: TransactionSigner<string>;
  let mockPayer: TransactionSigner<string>;

  beforeEach(() => {
    mockRpc = createMockRpc();
    mockMint = createMockSigner();
    mockPayer = createMockSigner();
  });

  it('should create mint instructions with default parameters', async () => {
    const instructions = await getCreateMintInstructions({
      rpc: mockRpc,
      mint: mockMint,
      payer: mockPayer,
    });

    expect(instructions).toHaveLength(2);
    expect(instructions[0].programAddress).toBe(
      '11111111111111111111111111111111'
    ); // System program for account creation
    expect(instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS); // Token program for mint init
  });

  it('should create mint instructions with custom decimals', async () => {
    const instructions = await getCreateMintInstructions({
      rpc: mockRpc,
      decimals: 6,
      mint: mockMint,
      payer: mockPayer,
    });

    expect(instructions).toHaveLength(2);
    expect(instructions[1].data).toBeDefined(); // Should contain decimals in init instruction
  });

  it('should create mint instructions with freeze authority', async () => {
    const freezeAuthority = generateMockAddress() as Address;

    const instructions = await getCreateMintInstructions({
      rpc: mockRpc,
      freezeAuthority,
      mint: mockMint,
      payer: mockPayer,
    });

    expect(instructions).toHaveLength(2);
  });

  it('should create mint instructions with extensions', async () => {
    const extensions = [
      { __kind: 'PermanentDelegate' as const, delegate: TEST_AUTHORITY },
    ];

    const instructions = await getCreateMintInstructions({
      rpc: mockRpc,
      extensions,
      mint: mockMint,
      payer: mockPayer,
    });

    expect(instructions).toHaveLength(2);
  });

  it('should use custom program address when provided', async () => {
    const customProgramAddress = generateMockAddress() as Address;

    const instructions = await getCreateMintInstructions({
      rpc: mockRpc,
      mint: mockMint,
      payer: mockPayer,
      programAddress: customProgramAddress,
    });

    expect(instructions).toHaveLength(2);
    expect(instructions[0].programAddress).toBe(
      '11111111111111111111111111111111'
    ); // System program for account creation
    expect(instructions[1].programAddress).toBe(customProgramAddress); // Custom token program for mint init
  });
});
