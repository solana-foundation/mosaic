import type { Address } from 'gill';

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

export type TokenType = 'stablecoin' | 'arcade-token' | 'tokenized-security' | 'unknown';

export type AclMode = 'allowlist' | 'blocklist' | 'none';

export interface ScaledUiAmountInfo {
    enabled: boolean;
    multiplier?: number;
    authority?: Address | null;
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
    freezeAuthority?: string;

    // Extensions list
    extensions: string[];

    // Scaled UI amount multiplier (for tokenized securities)
    multiplier?: number;
}
