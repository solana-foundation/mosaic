import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
  isAddress,
} from 'gill';
import { createMintToTransaction, getMintInfo } from '@mosaic/sdk';
import bs58 from 'bs58';

export interface MintOptions {
  mintAddress: string;
  recipient: string;
  amount: string;
  mintAuthority?: string;
  feePayer?: string;
  rpcUrl?: string;
}

export interface MintResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintedAmount?: string;
  recipient?: string;
}

/**
 * Validates mint options and returns parsed amount
 * @param options - Mint configuration options
 * @returns Parsed amount as bigint
 * @throws Error if validation fails
 */
function validateMintOptions(options: MintOptions): bigint {
  if (!options.mintAddress || !options.recipient || !options.amount) {
    throw new Error('Mint address, recipient, and amount are required');
  }

  // Validate Solana address format
  if (!isAddress(options.mintAddress)) {
    throw new Error('Invalid mint address format');
  }
  if (!isAddress(options.recipient)) {
    throw new Error('Invalid recipient address format');
  }

  // Validate amount is a positive number
  const amount = parseFloat(options.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  return BigInt(Math.floor(amount * Math.pow(10, 9))); // Assume 9 decimals for now
}

/**
 * Converts human-readable amount to raw token amount using mint decimals
 * @param amount - Human-readable amount as string
 * @param decimals - Number of decimal places for the mint
 * @returns Raw token amount as bigint
 */
function convertAmountToRaw(amount: string, decimals: number): bigint {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  return BigInt(Math.floor(numericAmount * Math.pow(10, decimals)));
}

/**
 * Mints tokens to a recipient using the wallet standard transaction signer
 * @param options - Configuration options for minting
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to mint result with signature and details
 */
export const mintTokens = async (
  options: MintOptions,
  signer: TransactionSendingSigner
): Promise<MintResult> => {
  try {
    // Validate options
    validateMintOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Set authorities (default to signer if not provided)
    // If both mintAuthority and feePayer are the same address, use the same signer instance
    const mintAuthorityAddress = options.mintAuthority || signerAddress;
    const feePayerAddress = options.feePayer || signerAddress;

    // Only allow minting if the wallet is the mint authority
    if (mintAuthorityAddress !== feePayerAddress) {
      throw new Error(
        'Only the mint authority can mint tokens. Please ensure the connected wallet is the mint authority.'
      );
    }

    // Use the wallet signer for both mint authority and fee payer
    const mintAuthority = signer;
    const feePayer = signer;

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Get mint info to determine decimals
    const mintInfo = await getMintInfo(rpc, options.mintAddress as Address);
    const decimals = mintInfo.decimals;

    // Convert amount to raw token amount
    const rawAmount = convertAmountToRaw(options.amount, decimals);

    // Create mint transaction using SDK
    const transaction = await createMintToTransaction(
      rpc,
      options.mintAddress as Address,
      options.recipient as Address,
      rawAmount,
      mintAuthority,
      feePayer
    );

    // Sign and send the transaction
    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);
    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      mintedAmount: options.amount,
      recipient: options.recipient,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
