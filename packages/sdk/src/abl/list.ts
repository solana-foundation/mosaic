import {
  createTransaction,
  type Address,
  type Base58EncodedBytes,
  type FullTransaction,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionMessageWithFeePayer,
  type TransactionSigner,
  type TransactionVersion,
  type TransactionWithBlockhashLifetime,
} from 'gill';
import { ABL_PROGRAM_ID } from './utils';
import {
  fetchListConfig,
  findListConfigPda,
  getABWalletDecoder,
  getInitializeListConfigInstruction,
  Mode,
} from '@mosaic/abl';

/**
 * Generates instructions for creating a new allowlist/blocklist configuration.
 *
 * This function creates the necessary instructions to initialize a list configuration
 * that can be used for gating token operations. The list can be configured as either
 * an allowlist or blocklist depending on the mode.
 *
 * @param input - Configuration parameters for list creation
 * @param input.authority - The authority signer who will control the list configuration
 * @returns Promise containing the instructions and the list configuration address
 */
export const getCreateListInstructions = async (input: {
  authority: TransactionSigner<string>;
  mint: Address;
  mode?: Mode;
}): Promise<{ instructions: Instruction<string>[]; listConfig: Address }> => {
  const listConfigPda = await findListConfigPda(
    { authority: input.authority.address, seed: input.mint },
    { programAddress: ABL_PROGRAM_ID }
  );

  const createListInstruction = getInitializeListConfigInstruction(
    {
      authority: input.authority,
      listConfig: listConfigPda[0],
      mode: input.mode || Mode.Allow,
      seed: input.mint,
    },
    { programAddress: ABL_PROGRAM_ID }
  );

  return {
    instructions: [createListInstruction],
    listConfig: listConfigPda[0],
  };
};

/**
 * Creates a complete transaction for initializing a new allowlist/blocklist configuration.
 *
 * This function builds a full transaction that can be signed and sent to create
 * a list configuration. The transaction includes the necessary instructions and
 * uses the latest blockhash for proper transaction construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who will control the list configuration
 * @returns Promise containing the full transaction and the list configuration address
 */
export const getCreateListTransaction = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  payer: TransactionSigner<string>;
  authority: TransactionSigner<string>;
  mint: Address;
}): Promise<{
  transaction: FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >;
  listConfig: Address;
}> => {
  const { instructions, listConfig } = await getCreateListInstructions({
    authority: input.authority,
    mint: input.mint,
  });
  const { value: latestBlockhash } = await input.rpc
    .getLatestBlockhash()
    .send();
  const transaction = createTransaction({
    feePayer: input.payer,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
  return {
    transaction,
    listConfig,
  };
};

/**
 * Configuration data for an allowlist or blocklist.
 *
 * This interface represents the core configuration of a list, including its mode,
 * seed, and authority. It does not include the actual wallet addresses that are
 * part of the list.
 */
export interface ListConfig {
  /** The address of the list configuration account */
  listConfig: Address;
  /** The mode of the list (allowlist or blocklist) */
  mode: Mode;
  /** The seed used to derive the list configuration PDA */
  seed: Address;
  /** The authority that controls the list configuration */
  authority: Address;
}

/**
 * Complete list data including configuration and wallet addresses.
 *
 * This interface extends ListConfig to include the actual wallet addresses
 * that are part of the allowlist or blocklist.
 */
export interface List extends ListConfig {
  /** Array of wallet addresses that are part of this list */
  wallets: Address[];
}

/**
 * Fetches the configuration data for an existing allowlist or blocklist.
 *
 * This function retrieves the configuration information for a list from the blockchain,
 * including its mode, seed, and authority. It does not fetch the actual wallet
 * addresses that are part of the list.
 *
 * @param input - Parameters for fetching the list configuration
 * @param input.rpc - The Solana RPC client instance
 * @param input.listConfig - The address of the list configuration account
 * @returns Promise containing the list configuration data
 */
export const getListConfig = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  listConfig: Address;
}): Promise<ListConfig> => {
  const listConfig = await fetchListConfig(input.rpc, input.listConfig);
  return {
    listConfig: listConfig.address,
    mode: listConfig.data.mode,
    seed: listConfig.data.seed,
    authority: listConfig.data.authority,
  };
};

/**
 * Fetches the complete list data including configuration and wallet addresses.
 *
 * This function retrieves both the configuration information and all wallet addresses
 * that are part of an allowlist or blocklist. It queries the blockchain for all
 * wallet accounts associated with the list configuration.
 *
 * @param input - Parameters for fetching the complete list data
 * @param input.rpc - The Solana RPC client instance
 * @param input.listConfig - The address of the list configuration account
 * @returns Promise containing the complete list data including wallet addresses
 */
export const getList = async (input: {
  rpc: Rpc<SolanaRpcApi>;
  listConfig: Address;
}): Promise<List> => {
  const listConfig = await getListConfig(input);

  const accounts = await input.rpc
    .getProgramAccounts(ABL_PROGRAM_ID, {
      encoding: 'base64',
      filters: [
        {
          dataSize: 72n,
          memcmp: {
            bytes: input.listConfig as unknown as Base58EncodedBytes,
            encoding: 'base58',
            offset: 40n,
          },
        },
      ],
    })
    .send();

  const list = accounts.map(account => {
    const data = Uint8Array.from(account.account.data[0]);
    const abWallet = getABWalletDecoder().decode(data);
    return abWallet.wallet;
  });

  return {
    ...listConfig,
    wallets: list,
  };
};
