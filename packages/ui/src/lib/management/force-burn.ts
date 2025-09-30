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
  createForceBurnTransaction,
  validatePermanentDelegateForBurn,
} from '@mosaic/sdk';
import bs58 from 'bs58';

export interface ForceBurnOptions {
  mintAddress: string;
  fromAddress: string;
  amount: string;
  permanentDelegate?: string;
  feePayer?: string;
  rpcUrl?: string;
}

export interface ForceBurnResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  burnAmount?: string;
  fromAddress?: string;
}

/**
 * Validates force burn options
 * @param options - Force burn configuration options
 * @throws Error if validation fails
 */
function validateForceBurnOptions(options: ForceBurnOptions): void {
  if (!options.mintAddress || !options.fromAddress || !options.amount) {
    throw new Error('Mint address, from address, and amount are required');
  }

  // Validate Solana address format
  if (!isAddress(options.mintAddress)) {
    throw new Error('Invalid mint address format');
  }
  if (!isAddress(options.fromAddress)) {
    throw new Error('Invalid source address format');
  }

  // Validate amount is a positive number
  const amount = parseFloat(options.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

/**
 * Force burns tokens using the permanent delegate extension
 * @param options - Configuration options for force burn
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to force burn result with signature and details
 */
export const forceBurnTokens = async (
  options: ForceBurnOptions,
  signer: TransactionSendingSigner
): Promise<ForceBurnResult> => {
  try {
    // Validate options
    validateForceBurnOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Set authorities (default to signer if not provided)
    const permanentDelegateAddress = options.permanentDelegate || signerAddress;

    // Only allow force burn if the wallet is the permanent delegate
    if (permanentDelegateAddress !== signerAddress) {
      throw new Error(
        'Only the permanent delegate can force burn tokens. Please ensure the connected wallet has permanent delegate authority.'
      );
    }

    // Use the wallet signer for both permanent delegate and fee payer
    const permanentDelegate = signer;
    const feePayer = signer;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Validate that the mint has permanent delegate extension and it matches our signer
    await validatePermanentDelegateForBurn(
      rpc,
      options.mintAddress as Address,
      permanentDelegateAddress as Address
    );

    // Create force burn transaction using SDK
    const transaction = await createForceBurnTransaction(
      rpc,
      options.mintAddress as Address,
      options.fromAddress as Address,
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
      burnAmount: options.amount,
      fromAddress: options.fromAddress,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
