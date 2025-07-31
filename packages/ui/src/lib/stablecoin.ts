import {
  signTransactionMessageWithSigners,
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  getSignatureFromTransaction,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import { StablecoinOptions, StablecoinCreationResult } from '@/types/token';
import { createStablecoinInitTransaction } from '@mosaic/sdk';
import { UiWalletAccount } from '@wallet-standard/react';
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
): Promise<{
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintAddress?: string;
}> => {
  try {
    const decimals = validateStablecoinOptions(options);

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
      metadataAuthority,
      pausableAuthority,
      confidentialBalancesAuthority,
      permanentDelegateAuthority
    );

    // Sign the transaction
    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);

    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      mintAddress: mintKeypair.address,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Simplified version for UI integration that handles the transaction conversion
 * This version works with the existing UI structure
 */
export const createStablecoinForUI = async (
  options: StablecoinOptions,
  wallet: UiWalletAccount
): Promise<StablecoinCreationResult> => {
  try {
    const decimals = validateStablecoinOptions(options);

    // Get wallet public key
    const walletPublicKey = wallet.publicKey;
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
      wallet.address as Address, // Use wallet as fee payer
      metadataAuthority,
      pausableAuthority,
      confidentialBalancesAuthority,
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
        confidentialBalancesAuthority: confidentialBalancesAuthority,
        permanentDelegateAuthority: permanentDelegateAuthority,
        extensions: [
          'Metadata',
          'Pausable',
          'Default Account State (Blocklist)',
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
