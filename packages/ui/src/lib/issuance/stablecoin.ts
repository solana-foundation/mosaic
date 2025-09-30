import {
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import { StablecoinCreationResult, StablecoinOptions } from '@/types/token';
import { createStablecoinInitTransaction } from '@mosaic/sdk';
import bs58 from 'bs58';

/**
 * Validates stablecoin options and returns parsed decimals
 * @param options - Stablecoin configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateStablecoinOptions(options: StablecoinOptions): number {
  if (!options.name || !options.symbol) {
    throw new Error('Name and symbol are required');
  }

  const decimals = parseInt(options.decimals, 10);
  if (isNaN(decimals) || decimals < 0 || decimals > 9) {
    throw new Error('Decimals must be a number between 0 and 9');
  }

  return decimals;
}

/**
 * Creates a stablecoin using the wallet standard transaction signer
 * @param options - Configuration options for the stablecoin
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to creation result with signature and mint address
 */
export const createStablecoin = async (
  options: StablecoinOptions,
  signer: TransactionSendingSigner
): Promise<StablecoinCreationResult> => {
  try {
    const decimals = validateStablecoinOptions(options);
    const enableSrfc37 =
      (options.enableSrfc37 as unknown) === true ||
      (options.enableSrfc37 as unknown) === 'true';

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Generate mint keypair
    const mintKeypair = await generateKeyPairSigner();

    // Set authorities (default to signer if not provided)
    const mintAuthority = (options.mintAuthority || signerAddress) as Address;
    const metadataAuthority = (options.metadataAuthority ||
      mintAuthority) as Address;
    const pausableAuthority = (options.pausableAuthority ||
      mintAuthority) as Address;
    const confidentialBalancesAuthority =
      (options.confidentialBalancesAuthority || mintAuthority) as Address;
    const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
      mintAuthority) as Address;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Create stablecoin transaction using SDK
    const transaction = await createStablecoinInitTransaction(
      rpc,
      options.name,
      options.symbol,
      decimals,
      options.uri || '',
      mintAuthority,
      mintKeypair,
      signer, // Use wallet as fee payer
      options.aclMode || 'blocklist',
      metadataAuthority,
      pausableAuthority,
      confidentialBalancesAuthority,
      permanentDelegateAuthority,
      enableSrfc37
    );

    // Sign the transaction
    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);

    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      mintAddress: mintKeypair.address,
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals,
        aclMode: options.aclMode || 'blocklist',
        mintAuthority,
        metadataAuthority,
        pausableAuthority,
        confidentialBalancesAuthority,
        permanentDelegateAuthority,
        extensions: [
          'Metadata',
          'Pausable',
          'Confidential Balances',
          'Permanent Delegate',
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
