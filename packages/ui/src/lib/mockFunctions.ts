import { StablecoinOptions, StablecoinCreationResult, ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';

// Mock function for stablecoin creation
export const mockCreateStablecoinForUI = async (
  options: StablecoinOptions,
  wallet: any
): Promise<StablecoinCreationResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate random success/failure for testing
  const isSuccess = Math.random() > 0.2; // 80% success rate

  if (isSuccess) {
    return {
      success: true,
      transactionSignature: 'mock_signature_' + Math.random().toString(36).substring(7),
      mintAddress: 'mock_mint_address_' + Math.random().toString(36).substring(7),
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals, 10),
        mintAuthority: options.mintAuthority || wallet.publicKey.toString(),
        metadataAuthority: options.metadataAuthority || options.mintAuthority || wallet.publicKey.toString(),
        pausableAuthority: options.pausableAuthority || options.mintAuthority || wallet.publicKey.toString(),
        confidentialBalancesAuthority: options.confidentialBalancesAuthority || options.mintAuthority || wallet.publicKey.toString(),
        permanentDelegateAuthority: options.permanentDelegateAuthority || options.mintAuthority || wallet.publicKey.toString(),
        extensions: [
          'Metadata',
          'Pausable',
          'Default Account State (Blocklist)',
          'Confidential Balances',
          'Permanent Delegate'
        ]
      }
    };
  } else {
    return {
      success: false,
      error: 'Mock error: Failed to create stablecoin (simulated failure)'
    };
  }
};

// Mock function for arcade token creation
export const mockCreateArcadeTokenForUI = async (
  options: ArcadeTokenOptions,
  wallet: any
): Promise<ArcadeTokenCreationResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate random success/failure for testing
  const isSuccess = Math.random() > 0.2; // 80% success rate

  if (isSuccess) {
    return {
      success: true,
      transactionSignature: 'mock_signature_' + Math.random().toString(36).substring(7),
      mintAddress: 'mock_mint_address_' + Math.random().toString(36).substring(7),
      details: {
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals, 10),
        mintAuthority: options.mintAuthority || wallet.publicKey.toString(),
        metadataAuthority: options.metadataAuthority || options.mintAuthority || wallet.publicKey.toString(),
        pausableAuthority: options.pausableAuthority || options.mintAuthority || wallet.publicKey.toString(),
        permanentDelegateAuthority: options.permanentDelegateAuthority || options.mintAuthority || wallet.publicKey.toString(),
        extensions: [
          'Metadata',
          'Pausable',
          'Default Account State (Blocklist)',
          'Permanent Delegate'
        ]
      }
    };
  } else {
    return {
      success: false,
      error: 'Mock error: Failed to create arcade token (simulated failure)'
    };
  }
}; 