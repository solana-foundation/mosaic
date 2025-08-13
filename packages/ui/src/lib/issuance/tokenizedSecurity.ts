import {
  generateKeyPairSigner,
  createSolanaRpc,
  type Address,
  type Rpc,
  type SolanaRpcApi,
  signAndSendTransactionMessageWithSigners,
  TransactionSendingSigner,
} from 'gill';
import {
  TokenizedSecurityOptions,
  TokenizedSecurityCreationResult,
} from '@/types/token';
import { createTokenizedSecurityInitTransaction } from '@mosaic/sdk';
import bs58 from 'bs58';

function validateOptions(options: TokenizedSecurityOptions): number {
  if (!options.name || !options.symbol) {
    throw new Error('Name and symbol are required');
  }
  const decimals = parseInt(options.decimals, 10);
  if (isNaN(decimals) || decimals < 0 || decimals > 9) {
    throw new Error('Decimals must be a number between 0 and 9');
  }
  const multiplier = Number(options.multiplier ?? '1');
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error('Multiplier must be a positive number');
  }
  return decimals;
}

export const createTokenizedSecurity = async (
  options: TokenizedSecurityOptions,
  signer: TransactionSendingSigner
): Promise<TokenizedSecurityCreationResult> => {
  try {
    const decimals = validateOptions(options);

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
    const scaledUiAmountAuthority = (options.scaledUiAmountAuthority ||
      mintAuthority) as Address;

    const multiplier = Number(options.multiplier ?? '1');

    // Create RPC client
    const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
    const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);

    const transaction = await createTokenizedSecurityInitTransaction(
      rpc,
      options.name,
      options.symbol,
      decimals,
      options.uri || '',
      mintAuthority,
      mintKeypair,
      signer,
      {
        aclMode: options.aclMode || 'blocklist',
        metadataAuthority,
        pausableAuthority,
        confidentialBalancesAuthority,
        permanentDelegateAuthority,
        scaledUiAmount: {
          authority: scaledUiAmountAuthority,
          multiplier,
        },
      }
    );

    const signature =
      await signAndSendTransactionMessageWithSigners(transaction);

    return {
      success: true,
      transactionSignature: bs58.encode(signature),
      mintAddress: mintKeypair.address,
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals,
        aclMode: options.aclMode || 'blocklist',
        mintAuthority,
        metadataAuthority,
        pausableAuthority,
        confidentialBalancesAuthority,
        permanentDelegateAuthority,
        multiplier,
        extensions: [
          'Metadata',
          'Pausable',
          `Default Account State (${(options.aclMode || 'blocklist') === 'allowlist' ? 'Allowlist' : 'Blocklist'})`,
          'Confidential Balances',
          'Permanent Delegate',
          'Scaled UI Amount',
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
