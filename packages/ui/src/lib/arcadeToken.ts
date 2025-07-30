import {
  signTransactionMessageWithSigners,
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  getSignatureFromTransaction,
} from 'gill';
import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
import { WalletAdapter } from '@/types/wallet';
import { createArcadeTokenInitTransaction } from '@mosaic/sdk';

/**
 * Validates required fields for arcade token creation
 */
const validateRequiredFields = (options: ArcadeTokenOptions): void => {
  if (!options.name || !options.symbol) {
    throw new Error('Name and symbol are required');
  }
};

/**
 * Validates and parses decimals value
 */
const validateAndParseDecimals = (decimalsString: string): number => {
  const decimals = parseInt(decimalsString, 10);
  if (isNaN(decimals) || decimals < 0 || decimals > 9) {
    throw new Error('Decimals must be a number between 0 and 9');
  }
  return decimals;
};

/**
 * Validates wallet connection and returns signer address
 */
const validateWalletAndGetSignerAddress = (wallet: WalletAdapter): string => {
  const walletPublicKey = wallet.publicKey;
  if (!walletPublicKey) {
    throw new Error('Wallet not connected');
  }
  return walletPublicKey.toString();
};

/**
 * Sets up authorities with fallback to signer address
 */
const setupAuthorities = (
  options: ArcadeTokenOptions,
  signerAddress: string
): {
  mintAuthority: Address;
  metadataAuthority: Address;
  pausableAuthority: Address;
  permanentDelegateAuthority: Address;
} => {
  const mintAuthority = (options.mintAuthority || signerAddress) as Address;
  const metadataAuthority = (options.metadataAuthority ||
    mintAuthority) as Address;
  const pausableAuthority = (options.pausableAuthority ||
    mintAuthority) as Address;
  const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
    mintAuthority) as Address;

  return {
    mintAuthority,
    metadataAuthority,
    pausableAuthority,
    permanentDelegateAuthority,
  };
};

/**
 * Creates RPC client with default URL fallback
 */
const createRpcClient = (rpcUrl?: string): Rpc<SolanaRpcApi> => {
  const url = rpcUrl || 'https://api.devnet.solana.com';
  return createSolanaRpc(url);
};

/**
 * Creates an arcade token using the web-compatible version of the CLI script
 * @param options - Configuration options for the arcade token
 * @param wallet - Solana wallet instance
 * @returns Promise that resolves to the transaction signature
 */
export const createArcadeToken = async (
  options: ArcadeTokenOptions,
  wallet: WalletAdapter
): Promise<string> => {
  try {
    validateRequiredFields(options);
    const decimals = validateAndParseDecimals(options.decimals);
    const signerAddress = validateWalletAndGetSignerAddress(wallet);

    // Generate mint keypair
    const mintKeypair = await generateKeyPairSigner();

    // Set authorities (default to signer if not provided)
    const {
      mintAuthority,
      metadataAuthority,
      pausableAuthority,
      permanentDelegateAuthority,
    } = setupAuthorities(options, signerAddress);

    // Create RPC client
    const rpc = createRpcClient(options.rpcUrl);

    // Create arcade token transaction using SDK
    const transaction = await createArcadeTokenInitTransaction(
      rpc,
      options.name,
      options.symbol,
      decimals,
      options.uri || '',
      mintAuthority,
      mintKeypair.address,
      signerAddress as Address,
      metadataAuthority,
      pausableAuthority,
      permanentDelegateAuthority
    );

    // Sign the transaction
    const signedTransaction =
      await signTransactionMessageWithSigners(transaction);
    const signature = getSignatureFromTransaction(signedTransaction);

    // Return the transaction signature
    return signature;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
};

/**
 * Simplified version for UI integration that handles the transaction conversion
 * This version works with the existing UI structure
 */
export const createArcadeTokenForUI = async (
  options: ArcadeTokenOptions,
  wallet: WalletAdapter
): Promise<ArcadeTokenCreationResult> => {
  try {
    validateRequiredFields(options);
    const decimals = validateAndParseDecimals(options.decimals);
    const signerAddress = validateWalletAndGetSignerAddress(wallet);

    // Generate mint keypair
    const mintKeypair = await generateKeyPairSigner();

    // Set authorities (default to signer if not provided)
    const {
      mintAuthority,
      metadataAuthority,
      pausableAuthority,
      permanentDelegateAuthority,
    } = setupAuthorities(options, signerAddress);

    // Create RPC client
    const rpc = createRpcClient(options.rpcUrl);

    // Create arcade token transaction using SDK
    const transaction = await createArcadeTokenInitTransaction(
      rpc,
      options.name,
      options.symbol,
      decimals,
      options.uri || '',
      mintAuthority,
      mintKeypair.address,
      signerAddress as Address,
      metadataAuthority,
      pausableAuthority,
      permanentDelegateAuthority
    );

    // Sign the transaction
    const signedTransaction =
      await signTransactionMessageWithSigners(transaction);
    const signature = getSignatureFromTransaction(signedTransaction);

    // Return success result with all details
    return {
      success: true,
      transactionSignature: signature,
      mintAddress: mintKeypair.address,
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals: decimals,
        mintAuthority: mintAuthority,
        metadataAuthority: metadataAuthority,
        pausableAuthority: pausableAuthority,
        permanentDelegateAuthority: permanentDelegateAuthority,
        extensions: [
          'Metadata',
          'Pausable',
          'Default Account State (Blocklist)',
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
