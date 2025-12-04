import type { TokenType } from '@mosaic/sdk';

export interface TokenDisplay {
    name?: string;
    symbol?: string;
    address?: string;
    supply?: string;
    detectedPatterns?: TokenType[];
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
    creatorWallet?: string;
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
        metadataAuthority?: string;
        pausableAuthority?: string;
        confidentialBalancesAuthority?: string;
        permanentDelegateAuthority?: string;
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
        metadataAuthority?: string;
        pausableAuthority?: string;
        permanentDelegateAuthority?: string;
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
        metadataAuthority?: string;
        pausableAuthority?: string;
        confidentialBalancesAuthority?: string;
        permanentDelegateAuthority?: string;
        multiplier: number;
        extensions: string[];
    };
}

export interface CustomTokenOptions {
    name: string;
    symbol: string;
    decimals: string;
    uri?: string;
    // Extension toggles
    enableMetadata?: boolean;
    enablePausable?: boolean;
    enablePermanentDelegate?: boolean;
    enableDefaultAccountState?: boolean;
    enableConfidentialBalances?: boolean;
    enableScaledUiAmount?: boolean;
    enableSrfc37?: boolean;
    enableTransferFee?: boolean;
    enableInterestBearing?: boolean;
    enableNonTransferable?: boolean;
    enableTransferHook?: boolean;
    // ACL mode (only relevant if SRFC-37 is enabled)
    aclMode?: 'allowlist' | 'blocklist';
    // Authority addresses
    mintAuthority?: string;
    metadataAuthority?: string;
    pausableAuthority?: string;
    permanentDelegateAuthority?: string;
    confidentialBalancesAuthority?: string;
    scaledUiAmountAuthority?: string;
    // Scaled UI Amount configuration
    scaledUiAmountMultiplier?: string;
    scaledUiAmountNewMultiplier?: string;
    // Default Account State configuration
    defaultAccountStateInitialized?: boolean;
    freezeAuthority?: string;
    // Transfer Fee configuration
    transferFeeBasisPoints?: string;
    transferFeeMaximum?: string;
    transferFeeAuthority?: string;
    withdrawWithheldAuthority?: string;
    // Interest Bearing configuration
    interestRate?: string;
    interestBearingAuthority?: string;
    // Transfer Hook configuration
    transferHookProgramId?: string;
    transferHookAuthority?: string;
    rpcUrl?: string;
}

export interface CustomTokenCreationResult {
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
        metadataAuthority?: string;
        pausableAuthority?: string;
        confidentialBalancesAuthority?: string;
        permanentDelegateAuthority?: string;
        scaledUiAmountAuthority?: string;
        scaledUiAmountMultiplier?: number;
        defaultAccountStateInitialized?: boolean;
        // Transfer Fee details
        transferFeeBasisPoints?: number;
        transferFeeMaximum?: string;
        transferFeeAuthority?: string;
        withdrawWithheldAuthority?: string;
        // Interest Bearing details
        interestRate?: number;
        interestBearingAuthority?: string;
        // Transfer Hook details
        transferHookProgramId?: string;
        transferHookAuthority?: string;
        extensions: string[];
    };
}
