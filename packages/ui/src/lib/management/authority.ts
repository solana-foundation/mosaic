import {
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import { AuthorityType } from 'gill/programs/token';
import { getUpdateAuthorityTransaction } from '@mosaic/sdk';
import bs58 from 'bs58';

export type AuthorityRole = AuthorityType | 'Metadata';

export interface UpdateAuthorityOptions {
  mint: string;
  role: AuthorityRole;
  newAuthority: string;
  rpcUrl?: string;
}

export interface UpdateAuthorityResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  authorityRole?: string;
  prevAuthority?: string;
  newAuthority?: string;
}

/**
 * Validates authority update options
 * @param options - Authority update configuration options
 * @throws Error if validation fails
 */
function validateUpdateAuthorityOptions(options: UpdateAuthorityOptions): void {
  if (!options.mint) {
    throw new Error('Mint address is required');
  }

  if (!options.newAuthority) {
    throw new Error('New authority address is required');
  }

  if (options.role === undefined || options.role === null) {
    throw new Error('Authority role is required');
  }

  // Basic address format validation
  if (options.mint.length < 32 || options.newAuthority.length < 32) {
    throw new Error('Invalid address format');
  }
}

/**
 * Updates the authority for a given mint and role
 * @param options - Configuration options for the authority update
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to update result with signature and authority details
 */
export const updateTokenAuthority = async (
  options: UpdateAuthorityOptions,
  signer: TransactionSendingSigner
): Promise<UpdateAuthorityResult> => {
  try {
    validateUpdateAuthorityOptions(options);

    // Get wallet public key
    const walletPublicKey = signer.address;
    if (!walletPublicKey) {
      throw new Error('Wallet not connected');
    }

    const signerAddress = walletPublicKey.toString();

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    // Create authority update transaction using SDK
    const transaction = await getUpdateAuthorityTransaction({
      rpc,
      payer: signer,
      mint: options.mint as Address,
      role: options.role,
      currentAuthority: signer,
      newAuthority: options.newAuthority as Address,
    });

    // Sign and send the transaction
    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);

    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      authorityRole: options.role.toString(),
      prevAuthority: signerAddress,
      newAuthority: options.newAuthority,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
