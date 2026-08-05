import type { ConfidentialApprovePolicy, TokenType } from '@solana/mosaic-sdk';

/**
 * Confidential-balances approve policy, as a form value.
 *
 * `'whitelist'` leaves the extension gated so the authority must approve each account;
 * `'opt-in'` lets holders configure their own confidential account permissionlessly.
 */
export type ConfidentialPolicy = ConfidentialApprovePolicy;

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
    image?: string;
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
    freezeAuthority?: string;
    // Confidential Balances configuration
    confidentialBalancesPolicy?: ConfidentialPolicy;
    auditorElgamalPubkey?: string;
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
        freezeAuthority?: string;
        confidentialBalancesPolicy?: ConfidentialPolicy;
        auditorElgamalPubkey?: string;
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
    freezeAuthority?: string;
    mintKeypair?: string;
    rpcUrl?: string;
    keypair?: string;
    confirmationTimeoutMs?: number; // Transaction confirmation timeout in milliseconds (default: 60000)
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
        freezeAuthority?: string;
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
    permissionedBurnAuthority?: string;
    scaledUiAmountAuthority?: string;
    freezeAuthority?: string;
    // Confidential Balances configuration
    confidentialBalancesPolicy?: ConfidentialPolicy;
    auditorElgamalPubkey?: string;
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
        permissionedBurnAuthority?: string;
        scaledUiAmountAuthority?: string;
        freezeAuthority?: string;
        confidentialBalancesPolicy?: ConfidentialPolicy;
        auditorElgamalPubkey?: string;
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
    scaledUiAmountMode?: 'static' | 'scheduled' | 'rebasing';
    scaledUiAmountMultiplier?: string;
    scaledUiAmountNewMultiplier?: string;
    scaledUiAmountEffectiveTimestamp?: string;
    // Default Account State configuration.
    // `true` = new accounts start Initialized, `false` = they start Frozen.
    defaultAccountStateInitialized?: boolean;
    freezeAuthority?: string;
    // Confidential Balances configuration
    confidentialBalancesPolicy?: ConfidentialPolicy;
    auditorElgamalPubkey?: string;
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
        freezeAuthority?: string;
        // Confidential Balances details
        confidentialBalancesPolicy?: ConfidentialPolicy;
        auditorElgamalPubkey?: string;
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
