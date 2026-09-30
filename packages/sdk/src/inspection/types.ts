import type { Address } from '@solana/kit';

export interface TokenMetadata {
    name?: string;
    symbol?: string;
    uri?: string;
    decimals?: number;
    updateAuthority?: Address | null;
    additionalMetadata?: Map<string, string>;
}

export interface TokenAuthorities {
    mintAuthority?: Address | null;
    freezeAuthority?: Address | null;
    updateAuthority?: Address | null;
    permanentDelegate?: Address | null;
    permanentDelegateAuthority?: Address | null;
    metadataAuthority?: Address | null;
    pausableAuthority?: Address | null;
    confidentialBalancesAuthority?: Address | null;
    scaledUiAmountAuthority?: Address | null;
    permissionedBurnAuthority?: Address | null;
}

export interface TokenSupplyInfo {
    supply: bigint;
    decimals: number;
    isInitialized: boolean;
}

export interface TokenExtension {
    name: string;
    details?: Record<string, unknown>;
}

export type TokenType = 'stablecoin' | 'arcade-token' | 'tokenized-security' | 'mmf' | 'unknown';

export type AclMode = 'allowlist' | 'blocklist' | 'none';

export interface ScaledUiAmountInfo {
    enabled: boolean;
    multiplier?: number;
    authority?: Address | null;
    // Scheduled multiplier change; a zero timestamp means nothing is scheduled
    newMultiplier?: number;
    newMultiplierEffectiveTimestamp?: bigint;
}

export interface TransferFeeInfo {
    // Newer fee: what the mint was configured with, in effect from `newerTransferFeeEpoch`
    transferFeeBasisPoints: number;
    // Raw base units
    maximumFee: bigint;
    newerTransferFeeEpoch: bigint;
    // Fee in effect before `newerTransferFeeEpoch`
    olderTransferFee: {
        epoch: bigint;
        transferFeeBasisPoints: number;
        maximumFee: bigint;
    };
    withheldAmount: bigint;
    authority: Address | null;
    withdrawAuthority: Address | null;
}

export interface InterestBearingInfo {
    // Rates are in basis points (APR)
    currentRate: number;
    preUpdateAverageRate: number;
    // Unix seconds
    initializationTimestamp: bigint;
    lastUpdateTimestamp: bigint;
    rateAuthority: Address | null;
}

export interface TokenInspectionResult {
    // Basic info
    address: Address;
    programId: Address;
    supplyInfo: TokenSupplyInfo;
    isToken2022: boolean;

    // Metadata
    metadata?: TokenMetadata;

    // All authorities
    authorities: TokenAuthorities;

    // Extensions and features
    extensions: TokenExtension[];
    detectedPatterns: TokenType[];
    isPausable: boolean;

    // ACL/SRFC37 info
    aclMode: AclMode;
    enableSrfc37: boolean;

    // Scaled UI amount info (for tokenized securities)
    scaledUiAmount?: ScaledUiAmountInfo;

    // Rate-bearing extensions
    transferFee?: TransferFeeInfo;
    interestBearing?: InterestBearingInfo;
}

export interface TokenDashboardData {
    // Basic token info
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    supply: string;
    uri?: string;
    image?: string;
    detectedPatterns: TokenType[];

    // ACL configuration
    aclMode: AclMode;
    enableSrfc37: boolean;

    // All authorities as strings
    mintAuthority?: string;
    metadataAuthority?: string;
    pausableAuthority?: string;
    confidentialBalancesAuthority?: string;
    permanentDelegateAuthority?: string;
    scaledUiAmountAuthority?: string;
    permissionedBurnAuthority?: string;
    freezeAuthority?: string;

    // Extensions list
    extensions: string[];

    // Scaled UI amount multiplier (for tokenized securities)
    multiplier?: number;
    scaledUiNewMultiplier?: number;
    // Unix seconds as a decimal string ('0' = nothing scheduled)
    scaledUiNewMultiplierEffectiveTimestamp?: string;

    // Rate-bearing extensions (bigints as decimal strings so the data stays JSON-serializable)
    transferFeeBasisPoints?: number;
    // Raw base units
    transferFeeMaximum?: string;
    // Current interest rate in basis points
    interestRate?: number;
}
