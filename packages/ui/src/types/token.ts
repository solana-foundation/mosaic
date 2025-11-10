export interface TokenDisplay {
  name?: string;
  symbol?: string;
  address?: string;
  supply?: string;
  type?: string;
  detectedPatterns?: string[];
  decimals?: number;
  mintAuthority?: string;
  freezeAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
  scaledUiAmountAuthority?: string;
  extensions?: string[];
  transactionSignature?: string;
  createdAt?: string;
  isSrfc37?: boolean;
  metadataUri?: string;
}

export interface StablecoinOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  aclMode?: 'allowlist' | 'blocklist';
  enableSrfc37?: boolean;
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
  rpcUrl?: string;
}

export interface StablecoinCreationResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintAddress?: string;
  details?: {
    name: string;
    symbol: string;
    decimals: number;
    aclMode?: 'allowlist' | 'blocklist';
    mintAuthority: string;
    metadataAuthority: string;
    pausableAuthority: string;
    confidentialBalancesAuthority: string;
    permanentDelegateAuthority: string;
    extensions: string[];
  };
}

export interface ArcadeTokenOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  enableSrfc37?: boolean;
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  permanentDelegateAuthority?: string;
  mintKeypair?: string;
  rpcUrl?: string;
  keypair?: string;
}

export interface ArcadeTokenCreationResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintAddress?: string;
  details?: {
    name: string;
    symbol: string;
    decimals: number;
    mintAuthority: string;
    metadataAuthority: string;
    pausableAuthority: string;
    permanentDelegateAuthority: string;
    enableSrfc37: boolean;
    extensions: string[];
  };
}

export interface TokenizedSecurityOptions {
  name: string;
  symbol: string;
  decimals: string;
  uri?: string;
  aclMode?: 'allowlist' | 'blocklist';
  enableSrfc37?: boolean;
  mintAuthority?: string;
  metadataAuthority?: string;
  pausableAuthority?: string;
  confidentialBalancesAuthority?: string;
  permanentDelegateAuthority?: string;
  scaledUiAmountAuthority?: string;
  multiplier?: string; // Scaled UI Amount multiplier
  rpcUrl?: string;
}

export interface TokenizedSecurityCreationResult {
  success: boolean;
  error?: string;
  transactionSignature?: string;
  mintAddress?: string;
  details?: {
    name: string;
    symbol: string;
    decimals: number;
    aclMode?: 'allowlist' | 'blocklist';
    mintAuthority: string;
    metadataAuthority: string;
    pausableAuthority: string;
    confidentialBalancesAuthority: string;
    permanentDelegateAuthority: string;
    multiplier: number;
    extensions: string[];
  };
}
