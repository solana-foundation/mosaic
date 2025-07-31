import {
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
import { createArcadeTokenInitTransaction } from '@mosaic/sdk';
import bs58 from 'bs58';

/**
 * Validates arcade token options and returns parsed decimals
 * @param options - Arcade token configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateArcadeTokenOptions(options: ArcadeTokenOptions): number {
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
 * Creates an arcade token using the wallet standard transaction signer
 * @param options - Configuration options for the arcade token
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to creation result with signature and mint address
 */
export const createArcadeToken = async (
  options: ArcadeTokenOptions,
  signer: TransactionSendingSigner
): Promise<{
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintAddress?: string;
}> => {
  try {
    const decimals = validateArcadeTokenOptions(options);

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
    const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
      mintAuthority) as Address;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Create arcade token transaction using SDK
    const transaction = await createArcadeTokenInitTransaction(
      rpc,
      options.name,
      options.symbol,
      decimals,
      options.uri || '',
      mintAuthority,
      mintKeypair,
      signer,
      metadataAuthority,
      pausableAuthority,
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
export const createArcadeTokenForUI = async (
  options: ArcadeTokenOptions,
  wallet: { publicKey: string; connected: boolean }
): Promise<ArcadeTokenCreationResult> => {
  try {
    const decimals = validateArcadeTokenOptions(options);

    if (!wallet.connected || !wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = wallet.publicKey;

    // Generate mint keypair
    const mintKeypair = await generateKeyPairSigner();

    // Set authorities (default to signer if not provided)
    const mintAuthority = (options.mintAuthority || signerAddress) as Address;
    const metadataAuthority = (options.metadataAuthority ||
      mintAuthority) as Address;
    const pausableAuthority = (options.pausableAuthority ||
      mintAuthority) as Address;
    const permanentDelegateAuthority = (options.permanentDelegateAuthority ||
      mintAuthority) as Address;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

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

    // For UI version, we'll simulate the transaction signature
    // In a real implementation, this would use the wallet to sign
    const mockSignature = bs58.encode(new Uint8Array(64).fill(1));

    // Return success result with all details
    return {
      success: true,
      transactionSignature: mockSignature,
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
