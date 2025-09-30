import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
  isAddress,
} from 'gill';
import {
  createForceTransferTransaction,
  validatePermanentDelegate,
} from '@mosaic/sdk';
import bs58 from 'bs58';

export interface ForceTransferOptions {
  mintAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  permanentDelegate?: string;
  feePayer?: string;
  rpcUrl?: string;
}

export interface ForceTransferResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  transferAmount?: string;
  fromAddress?: string;
  toAddress?: string;
}

/**
 * Validates force transfer options
 * @param options - Force transfer configuration options
 * @throws Error if validation fails
 */
function validateForceTransferOptions(options: ForceTransferOptions): void {
  if (
    !options.mintAddress ||
    !options.fromAddress ||
    !options.toAddress ||
    !options.amount
  ) {
    throw new Error(
      'Mint address, from address, to address, and amount are required'
    );
  }

  // Validate Solana address format
  if (!isAddress(options.mintAddress)) {
    throw new Error('Invalid mint address format');
  }
  if (!isAddress(options.fromAddress)) {
    throw new Error('Invalid source address format');
  }
  if (!isAddress(options.toAddress)) {
    throw new Error('Invalid destination address format');
  }

  // Validate amount is a positive number
  const amount = parseFloat(options.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

/**
 * Force transfers tokens using the permanent delegate extension
 * @param options - Configuration options for force transfer
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to force transfer result with signature and details
 */
export const forceTransferTokens = async (
  options: ForceTransferOptions,
  signer: TransactionSendingSigner
): Promise<ForceTransferResult> => {
  try {
    // Validate options
    validateForceTransferOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Set authorities (default to signer if not provided)
    const permanentDelegateAddress = options.permanentDelegate || signerAddress;

    // Only allow force transfer if the wallet is the permanent delegate
    if (permanentDelegateAddress !== signerAddress) {
      throw new Error(
        'Only the permanent delegate can force transfer tokens. Please ensure the connected wallet has permanent delegate authority.'
      );
    }

    // Use the wallet signer for both permanent delegate and fee payer
    const permanentDelegate = signer;
    const feePayer = signer;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Validate that the mint has permanent delegate extension and it matches our signer
    await validatePermanentDelegate(
      rpc,
      options.mintAddress as Address,
      permanentDelegateAddress as Address
    );

    // Create force transfer transaction using SDK
    const transaction = await createForceTransferTransaction(
      rpc,
      options.mintAddress as Address,
      options.fromAddress as Address,
      options.toAddress as Address,
      parseFloat(options.amount),
      permanentDelegate,
      feePayer
    );

    // Sign and send the transaction
    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      transferAmount: options.amount,
      fromAddress: options.fromAddress,
      toAddress: options.toAddress,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
