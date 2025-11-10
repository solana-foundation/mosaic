import {
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
  isAddress,
} from 'gill';
import {
  createAddToBlocklistTransaction,
  createRemoveFromBlocklistTransaction,
  createAddToAllowlistTransaction,
  createRemoveFromAllowlistTransaction,
} from '@mosaic/sdk';
import { getSignatureFromBytes } from '@/lib/solana/codecs';

export interface BlocklistOptions {
  mintAddress: string;
  walletAddress: string;
}

export interface BlocklistResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
}

/**
 * Validates mint options and returns parsed amount
 * @param options - Mint configuration options
 * @returns Parsed amount as bigint
 * @throws Error if validation fails
 */
function validateBlocklistOptions(options: BlocklistOptions): void {
  if (!options.mintAddress || !options.walletAddress) {
    throw new Error('Mint address and wallet address are required');
  }

  // Validate Solana address format
  if (!isAddress(options.mintAddress)) {
    throw new Error('Invalid mint address format');
  }
  if (!isAddress(options.walletAddress)) {
    throw new Error('Invalid wallet address format');
  }

  return;
}

/**
 * Mints tokens to a recipient using the wallet standard transaction signer
 * @param options - Configuration options for minting
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to mint result with signature and details
 */
export const addAddressToBlocklist = async (
  rpc: Rpc<SolanaRpcApi>,
  options: BlocklistOptions,
  signer: TransactionSendingSigner
): Promise<BlocklistResult> => {
  try {
    // Validate options
    validateBlocklistOptions(options);

    // Create blocklist transaction using SDK
    const transaction = await createAddToBlocklistTransaction(
      rpc,
      options.mintAddress as Address,
      options.walletAddress as Address,
      signer
    );

    // Sign and send the transaction
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: getSignatureFromBytes(signatureBytes),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const removeAddressFromBlocklist = async (
  rpc: Rpc<SolanaRpcApi>,
  options: BlocklistOptions,
  signer: TransactionSendingSigner
): Promise<BlocklistResult> => {
  try {
    // Validate options
    validateBlocklistOptions(options);

    // Create blocklist transaction using SDK
    const transaction = await createRemoveFromBlocklistTransaction(
      rpc,
      options.mintAddress as Address,
      options.walletAddress as Address,
      signer
    );

    // Sign and send the transaction
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: getSignatureFromBytes(signatureBytes),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const addAddressToAllowlist = async (
  rpc: Rpc<SolanaRpcApi>,
  options: BlocklistOptions,
  signer: TransactionSendingSigner
): Promise<BlocklistResult> => {
  try {
    // Validate options
    validateBlocklistOptions(options);

    // Create allowlist transaction using SDK
    const transaction = await createAddToAllowlistTransaction(
      rpc,
      options.mintAddress as Address,
      options.walletAddress as Address,
      signer
    );

    // Sign and send the transaction
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: getSignatureFromBytes(signatureBytes),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const removeAddressFromAllowlist = async (
  rpc: Rpc<SolanaRpcApi>,
  options: BlocklistOptions,
  signer: TransactionSendingSigner
): Promise<BlocklistResult> => {
  try {
    // Validate options
    validateBlocklistOptions(options);

    // Create allowlist removal transaction using SDK
    const transaction = await createRemoveFromAllowlistTransaction(
      rpc,
      options.mintAddress as Address,
      options.walletAddress as Address,
      signer
    );

    // Sign and send the transaction
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: getSignatureFromBytes(signatureBytes),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
