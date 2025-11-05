import {
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import { ArcadeTokenCreationResult, ArcadeTokenOptions } from '@/types/token';
import { createArcadeTokenInitTransaction } from '@mosaic/sdk';
import { getSignatureFromBytes } from '@/lib/solana/codecs';

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
): Promise<ArcadeTokenCreationResult> => {
  try {
    const decimals = validateArcadeTokenOptions(options);
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
      permanentDelegateAuthority,
      enableSrfc37
    );

    // Sign the transaction
    const signatureBytes =
      await signAndSendTransactionMessageWithSigners(transaction);

    return {
      success: true,
      transactionSignature: getSignatureFromBytes(signatureBytes),
      mintAddress: mintKeypair.address,
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals),
        enableSrfc37: options.enableSrfc37 || false,
        mintAuthority: options.mintAuthority || signerAddress,
        metadataAuthority: options.metadataAuthority || signerAddress,
        pausableAuthority: options.pausableAuthority || signerAddress,
        permanentDelegateAuthority:
          options.permanentDelegateAuthority || signerAddress,
        extensions: [
          'Metadata',
          'Pausable',
          'Default Account State (Allowlist)',
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
