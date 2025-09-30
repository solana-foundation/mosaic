import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  TransactionSendingSigner,
  isAddress,
} from 'gill';
import {
  pauseToken,
  unpauseToken,
  getTokenPauseState,
  type PauseTokenResult,
} from '@mosaic/sdk';
import bs58 from 'bs58';

export interface PauseOptions {
  mintAddress: string;
  pauseAuthority?: string;
  feePayer?: string;
  rpcUrl?: string;
}

/**
 * Validates pause options
 * @param options - Pause configuration options
 * @throws Error if validation fails
 */
function validatePauseOptions(options: PauseOptions): void {
  if (!options.mintAddress) {
    throw new Error('Mint address is required');
  }

  // Validate Solana address format
  if (!isAddress(options.mintAddress)) {
    throw new Error('Invalid mint address format');
  }
}

/**
 * Pauses a token using the wallet standard transaction signer
 * @param options - Configuration options for pausing
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to pause result with signature
 */
export const pauseTokenWithWallet = async (
  options: PauseOptions,
  signer: TransactionSendingSigner
): Promise<PauseTokenResult> => {
  try {
    // Validate options
    validatePauseOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Set authorities (default to signer if not provided)
    const pauseAuthorityAddress = options.pauseAuthority || signerAddress;
    const feePayerAddress = options.feePayer || signerAddress;

    // Only allow pausing if the wallet is the pause authority
    if (pauseAuthorityAddress !== feePayerAddress) {
      throw new Error(
        'Only the pause authority can pause tokens. Please ensure the connected wallet is the pause authority.'
      );
    }

    // Use the wallet signer for both pause authority and fee payer
    const pauseAuthority = signer;
    const feePayer = signer;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Pause the token using SDK
    const result = await pauseToken(rpc, {
      mint: options.mintAddress as Address,
      pauseAuthority,
      feePayer,
    });

    // Convert signature if present
    if (result.transactionSignature) {
      result.transactionSignature = bs58.encode(
        Buffer.from(result.transactionSignature, 'base64')
      );
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Unpauses a token using the wallet standard transaction signer
 * @param options - Configuration options for unpausing
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to unpause result with signature
 */
export const unpauseTokenWithWallet = async (
  options: PauseOptions,
  signer: TransactionSendingSigner
): Promise<PauseTokenResult> => {
  try {
    // Validate options
    validatePauseOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Set authorities (default to signer if not provided)
    const pauseAuthorityAddress = options.pauseAuthority || signerAddress;
    const feePayerAddress = options.feePayer || signerAddress;

    // Only allow unpausing if the wallet is the pause authority
    if (pauseAuthorityAddress !== feePayerAddress) {
      throw new Error(
        'Only the pause authority can unpause tokens. Please ensure the connected wallet is the pause authority.'
      );
    }

    // Use the wallet signer for both pause authority and fee payer
    const pauseAuthority = signer;
    const feePayer = signer;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Unpause the token using SDK
    const result = await unpauseToken(rpc, {
      mint: options.mintAddress as Address,
      pauseAuthority,
      feePayer,
    });

    // Convert signature if present
    if (result.transactionSignature) {
      result.transactionSignature = bs58.encode(
        Buffer.from(result.transactionSignature, 'base64')
      );
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Gets the current pause state of a token
 * @param mintAddress - Token mint address
 * @param rpcUrl - Optional RPC URL
 * @returns Promise that resolves to the pause state
 */
export const checkTokenPauseState = async (
  mintAddress: string,
  rpcUrl?: string
): Promise<boolean> => {
  try {
    if (!isAddress(mintAddress)) {
      throw new Error('Invalid mint address format');
    }

    const url = rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(url);

    return await getTokenPauseState(rpc, mintAddress as Address);
  } catch (error) {
    console.error('Error checking pause state:', error);
    return false;
  }
};
