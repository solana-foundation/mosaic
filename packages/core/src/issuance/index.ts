import {
  Address,
  Instruction,
  Rpc,
  SolanaRpcApiMainnet,
  some,
  TransactionMessageWithFeePayer,
  TransactionSigner,
  TransactionVersion,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import { createTransaction, FullTransaction } from 'gill';
import {
  AccountState,
  getMintSize,
  Extension,
  ExtensionArgs,
  extension,
  getInitializeMintInstruction,
  getPreInitializeInstructionsForMintExtensions,
  TOKEN_2022_PROGRAM_ADDRESS,
  getInitializeTokenMetadataInstruction,
} from '@solana-program/token-2022';

export class Token {
  private extensions: Extension[] = [];

  getExtensions(): Extension[] {
    return this.extensions;
  }

  withMetadata({
    mintAddress,
    authority,
    metadata,
    additionalMetadata,
  }: {
    mintAddress: Address;
    metadata: {
      name: string;
      symbol: string;
      uri: string;
    };
    authority: Address;
    additionalMetadata: Map<string, string>;
  }): Token {
    const metadataExtensions = createMetadataExtensions({
      mintAddress,
      authority,
      metadata,
      additionalMetadata,
    });
    this.extensions.push(...metadataExtensions);
    return this;
  }

  withPermanentDelegate(authority: Address): Token {
    const permanentDelegateExtension = extension('PermanentDelegate', {
      delegate: authority,
    });
    this.extensions.push(permanentDelegateExtension);
    return this;
  }

  withPausable(authority: Address): Token {
    const pausableConfigExtension = extension('PausableConfig', {
      authority: some(authority),
      paused: false,
    });
    this.extensions.push(pausableConfigExtension as Extension);
    return this;
  }

  withDefaultAccountState(initialState: boolean): Token {
    const defaultAccountStateExtension = extension('DefaultAccountState', {
      state: initialState
        ? AccountState.Initialized
        : AccountState.Uninitialized,
    });
    this.extensions.push(defaultAccountStateExtension);
    return this;
  }

  withConfidentialBalances(authority: Address): Token {
    const confidentialBalancesExtension = extension(
      'ConfidentialTransferMint',
      {
        authority: some(authority),
        autoApproveNewAccounts: false,
        auditorElgamalPubkey: null,
      }
    );
    this.extensions.push(confidentialBalancesExtension as Extension);
    return this;
  }

  async buildInstructions({
    rpc,
    decimals,
    authority,
    mint,
    feePayer,
  }: {
    rpc: Rpc<SolanaRpcApiMainnet>;
    decimals: number;
    authority: Address;
    mint: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
  }): Promise<Instruction[]> {
    // Get instructions for creating and initializing the mint account
    const [createMintAccountInstruction, initMintInstruction] =
      await getCreateMintInstructions({
        rpc: rpc,
        decimals,
        extensions: this.extensions,
        freezeAuthority: authority,
        mint: mint,
        payer: feePayer,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
      });
    const preInitializeInstructions = this.extensions.flatMap(ext =>
      getPreInitializeInstructionsForMintExtensions(mint.address, [ext])
    );

    // TODO: Add other post-initialize instructions as needed like for transfer hooks
    const postInitializeInstructions = this.extensions.flatMap(ext =>
      ext.__kind === 'TokenMetadata'
        ? [
            getInitializeTokenMetadataInstruction({
              metadata: mint.address,
              mint: mint.address,
              mintAuthority: feePayer,
              name: ext.name,
              symbol: ext.symbol,
              uri: ext.uri,
              updateAuthority: authority,
            }),
          ]
        : []
    );

    return [
      createMintAccountInstruction,
      ...preInitializeInstructions,
      initMintInstruction,
      ...postInitializeInstructions,
    ];
  }

  async buildTransaction({
    rpc,
    decimals,
    authority,
    mint,
    feePayer,
  }: {
    rpc: Rpc<SolanaRpcApiMainnet>;
    decimals: number;
    authority: Address;
    mint: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
  }): Promise<
    FullTransaction<TransactionVersion, TransactionMessageWithFeePayer>
  > {
    const instructions = await this.buildInstructions({
      rpc,
      decimals,
      authority,
      mint,
      feePayer,
    });

    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return createTransaction({
      feePayer,
      version: 'legacy',
      latestBlockhash,
      instructions,
    });
  }
}

/**
 * Generates instructions for creating and initializing a new token mint
 * @param input Configuration parameters for mint creation
 * @returns Array of instructions for creating and initializing the mint
 */
export const getCreateMintInstructions = async (input: {
  rpc: Rpc<SolanaRpcApiMainnet>;
  decimals?: number;
  extensions?: ExtensionArgs[];
  freezeAuthority?: Address;
  mint: TransactionSigner<string>;
  payer: TransactionSigner<string>;
  programAddress?: Address;
}): Promise<Instruction<string>[]> => {
  // Calculate required space for mint account including extensions
  const space = getMintSize(input.extensions);
  const postInitializeExtensions: Extension['__kind'][] = ['TokenMetadata'];

  // Calculate space excluding post-initialization extensions
  const spaceWithoutPostInitializeExtensions = input.extensions
    ? getMintSize(
        input.extensions.filter(
          e => !postInitializeExtensions.includes(e.__kind)
        )
      )
    : space;

  // Get minimum rent-exempt balance
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(
      BigInt(spaceWithoutPostInitializeExtensions)
    )
    .send();

  // Return create account and initialize mint instructions
  return [
    getCreateAccountInstruction({
      payer: input.payer,
      newAccount: input.mint,
      lamports: rent,
      space: spaceWithoutPostInitializeExtensions,
      programAddress: input.programAddress ?? TOKEN_2022_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction(
      {
        mint: input.mint.address,
        decimals: input.decimals ?? 0,
        freezeAuthority: input.freezeAuthority,
        mintAuthority: input.payer.address,
      },
      {
        programAddress: input.programAddress ?? TOKEN_2022_PROGRAM_ADDRESS,
      }
    ),
  ];
};

const createMetadataExtensions = ({
  mintAddress,
  authority,
  metadata,
  additionalMetadata,
}: {
  mintAddress: Address;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
  authority: Address;
  additionalMetadata: Map<string, string>;
}): Extension[] => {
  const metadataPointer = extension('MetadataPointer', {
    metadataAddress: some(mintAddress),
    authority: some(authority),
  });

  const metadataExtensionData = extension('TokenMetadata', {
    updateAuthority: some(authority),
    mint: mintAddress,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    additionalMetadata: additionalMetadata,
  });

  return [metadataPointer, metadataExtensionData] as [Extension, Extension];
};
