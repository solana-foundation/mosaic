import {
  type Address,
  fetchEncodedAccount,
  type Rpc,
  type SolanaRpcApi,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from 'gill';
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  decodeMint,
} from 'gill/programs/token';
import type {
  AclMode,
  ScaledUiAmountInfo,
  TokenAuthorities,
  TokenDashboardData,
  TokenExtension,
  TokenInspectionResult,
  TokenMetadata,
  TokenSupplyInfo,
  TokenType,
} from './types';
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl';

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = address(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

const STABLECOIN_EXTENSIONS = [
  'TokenMetadata',
  'PermanentDelegate',
  'DefaultAccountState',
  'ConfidentialTransferMint',
];

const ARCADE_TOKEN_EXTENSIONS = [
  'TokenMetadata',
  'PermanentDelegate',
  'DefaultAccountState',
];

const TOKENIZED_SECURITY_EXTENSIONS = [
  'TokenMetadata',
  'PermanentDelegate',
  'DefaultAccountState',
];

// Helper function to derive Metaplex metadata account address
async function deriveMetadataAccount(mintAddress: Address): Promise<Address> {
  const seeds = [
    Buffer.from('metadata'),
    getAddressEncoder().encode(METADATA_PROGRAM_ID),
    getAddressEncoder().encode(mintAddress),
  ];

  const [metadataAccount] = await getProgramDerivedAddress({
    programAddress: METADATA_PROGRAM_ID,
    seeds,
  });

  return metadataAccount;
}

// Helper function to fetch and parse Metaplex metadata
async function fetchMetaplexMetadata(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenMetadata | null> {
  try {
    const metadataAccount = await deriveMetadataAccount(mintAddress);
    const accountInfo = await fetchEncodedAccount(rpc, metadataAccount);

    if (!accountInfo.exists) {
      return null;
    }

    // Parse the metadata account data
    // Metaplex metadata has a specific structure
    const data = accountInfo.data;

    if (!data || data.length < 100) {
      return null;
    }

    // Skip the discriminator and key (first 1 byte)
    let offset = 1;

    // Skip update authority (32 bytes)
    offset += 32;

    // Skip mint (32 bytes)
    offset += 32;

    // Read name (32 bytes for length + string)
    const nameLength =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24);
    offset += 4;
    const nameBytes = data.slice(offset, offset + nameLength);
    const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
    offset += 32; // Name is always padded to 32 bytes in the account

    // Read symbol (10 bytes for length + string)
    const symbolLength =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24);
    offset += 4;
    const symbolBytes = data.slice(offset, offset + symbolLength);
    const symbol = new TextDecoder()
      .decode(symbolBytes)
      .replace(/\0/g, '')
      .trim();
    offset += 10; // Symbol is always padded to 10 bytes

    // Read URI (200 bytes for length + string)
    const uriLength =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24);
    offset += 4;
    const uriBytes = data.slice(offset, offset + uriLength);
    const uri = new TextDecoder().decode(uriBytes).replace(/\0/g, '').trim();

    return {
      name: name || undefined,
      symbol: symbol || undefined,
      uri: uri || undefined,
    };
  } catch (error) {
    console.error('Error fetching Metaplex metadata:', error);
    return null;
  }
}

export async function inspectToken(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenInspectionResult> {
  // Fetch the mint account
  const encodedAccount = await fetchEncodedAccount(rpc, mintAddress);

  if (!encodedAccount.exists) {
    throw new Error(`Mint account not found at address: ${mintAddress}`);
  }

  // Check if this is a Token or Token-2022 mint
  const isToken2022 =
    encodedAccount.programAddress === TOKEN_2022_PROGRAM_ADDRESS;
  const isToken = encodedAccount.programAddress === TOKEN_PROGRAM_ADDRESS;

  if (!isToken2022 && !isToken) {
    throw new Error(
      `Invalid mint account. Program owner: ${encodedAccount.programAddress}`
    );
  }

  // Decode mint data
  const decodedMint = decodeMint(encodedAccount);

  // Extract basic supply information
  const supplyInfo: TokenSupplyInfo = {
    supply: decodedMint.data.supply,
    decimals: decodedMint.data.decimals,
    isInitialized: decodedMint.data.isInitialized,
  };

  // Initialize authorities with basic ones from mint
  const authorities: TokenAuthorities = {
    mintAuthority:
      decodedMint.data.mintAuthority?.__option === 'Some'
        ? decodedMint.data.mintAuthority.value
        : null,
    freezeAuthority:
      decodedMint.data.freezeAuthority?.__option === 'Some'
        ? decodedMint.data.freezeAuthority.value
        : null,
  };

  // Process extensions (only for Token-2022)
  const extensions: TokenExtension[] = [];
  let metadata: TokenMetadata | undefined;
  let isPausable = false;
  let aclMode: AclMode = 'none';
  let enableSrfc37 = false;
  let scaledUiAmount: ScaledUiAmountInfo | undefined;

  if (isToken2022 && decodedMint.data.extensions?.__option === 'Some') {
    for (const ext of decodedMint.data.extensions.value) {
      if (!ext.__kind) continue;

      const extensionDetails: Record<string, any> = {};

      switch (ext.__kind) {
        case 'TokenMetadata':
          // Extract metadata and metadata authority
          metadata = {
            name: ext.name,
            symbol: ext.symbol,
            uri: ext.uri,
            updateAuthority:
              ext.updateAuthority?.__option === 'Some'
                ? ext.updateAuthority.value
                : null,
          };

          // Set metadata authority
          authorities.metadataAuthority = metadata.updateAuthority;
          authorities.updateAuthority = metadata.updateAuthority;

          // Add additional metadata if present
          if (ext.additionalMetadata && ext.additionalMetadata.size > 0) {
            metadata.additionalMetadata = new Map();
            for (const [key, value] of ext.additionalMetadata.entries()) {
              metadata.additionalMetadata.set(key, value);
            }
          }

          extensions.push({
            name: 'TokenMetadata',
            details: { ...metadata },
          });
          break;

        case 'DefaultAccountState':
          extensionDetails.state = ext.state;

          // Determine ACL mode based on state
          // AccountState is likely an enum, so we need to check its string representation
          const stateStr = String(ext.state);
          if (stateStr === 'Frozen' || stateStr === '2') {
            aclMode = 'allowlist'; // Frozen by default = allowlist
          } else if (stateStr === 'Initialized' || stateStr === '1') {
            aclMode = 'blocklist'; // Initialized by default = blocklist
          }

          extensions.push({
            name: 'DefaultAccountState',
            details: extensionDetails,
          });
          break;

        case 'PermanentDelegate':
          if (ext.delegate) {
            authorities.permanentDelegate = ext.delegate;
            authorities.permanentDelegateAuthority = ext.delegate;
            extensionDetails.delegate = ext.delegate;
          }
          extensions.push({
            name: 'PermanentDelegate',
            details: extensionDetails,
          });
          break;

        case 'ConfidentialTransferMint':
          const confidentialAuthority =
            ext.authority?.__option === 'Some' ? ext.authority.value : null;

          authorities.confidentialBalancesAuthority = confidentialAuthority;
          extensionDetails.authority = confidentialAuthority;
          extensionDetails.autoApproveNewAccounts = ext.autoApproveNewAccounts;

          extensions.push({
            name: 'ConfidentialTransferMint',
            details: extensionDetails,
          });
          break;

        case 'PausableConfig':
          const pausableAuthority =
            ext.authority?.__option === 'Some' ? ext.authority.value : null;

          authorities.pausableAuthority = pausableAuthority;
          extensionDetails.authority = pausableAuthority;
          extensionDetails.paused = ext.paused;
          isPausable = true;

          extensions.push({
            name: 'PausableConfig',
            details: extensionDetails,
          });
          break;

        case 'ScaledUiAmountConfig':
          extensionDetails.authority = ext.authority ? ext.authority : null;
          extensionDetails.multiplier = ext.multiplier;
          extensions.push({
            name: 'ScaledUiAmountConfig',
            details: extensionDetails,
          });
          scaledUiAmount = {
            enabled: true,
            multiplier: ext.multiplier,
            authority: authorities.metadataAuthority,
          };
          break;

        case 'TransferFeeConfig':
          if (ext.transferFeeConfigAuthority) {
            extensionDetails.authority = ext.transferFeeConfigAuthority;
          }
          if (ext.withdrawWithheldAuthority) {
            extensionDetails.withdrawAuthority = ext.withdrawWithheldAuthority;
          }
          extensions.push({
            name: 'TransferFeeConfig',
            details: extensionDetails,
          });
          break;

        case 'MetadataPointer':
          extensionDetails.authority =
            ext.authority?.__option === 'Some' ? ext.authority.value : null;
          extensionDetails.metadataAddress =
            ext.metadataAddress?.__option === 'Some'
              ? ext.metadataAddress.value
              : null;
          extensions.push({
            name: 'MetadataPointer',
            details: extensionDetails,
          });
          break;

        default:
          // Add any other extension generically
          extensions.push({
            name: ext.__kind,
            details: { ...ext },
          });
      }
    }

    // Check for SRFC37 and ScaledUiAmount in additional metadata
    enableSrfc37 = authorities.freezeAuthority === TOKEN_ACL_PROGRAM_ID;
  }

  // For legacy SPL tokens, try to fetch Metaplex metadata
  if (!isToken2022 && !metadata) {
    const metaplexMetadata = await fetchMetaplexMetadata(rpc, mintAddress);
    if (metaplexMetadata) {
      metadata = metaplexMetadata;
      // For legacy tokens with metadata, add a virtual extension for tracking
      extensions.push({
        name: 'MetaplexMetadata',
        details: { ...metaplexMetadata },
      });
    }
  }

  // Check if token is pausable (has freeze authority or PausableConfig)
  isPausable = isPausable || authorities.freezeAuthority !== null;

  // If pausable but no specific pausable authority, use freeze authority
  if (isPausable && !authorities.pausableAuthority) {
    authorities.pausableAuthority = authorities.freezeAuthority;
  }

  // Add Pausable to extensions if applicable
  if (isPausable && !extensions.some(ext => ext.name === 'Pausable')) {
    extensions.push({ name: 'Pausable' });
  }

  // Detect token type
  const detectedType = detectTokenType(extensions);

  return {
    address: mintAddress,
    programId: encodedAccount.programAddress,
    supplyInfo,
    metadata,
    authorities,
    extensions,
    detectedType,
    isPausable,
    isToken2022,
    aclMode,
    enableSrfc37,
    scaledUiAmount,
  };
}

function detectTokenType(extensions: TokenExtension[]): TokenType {
  const extensionNames = extensions.map(ext => ext.name);

  // Check for stablecoin pattern first (most specific)
  const isStablecoin = STABLECOIN_EXTENSIONS.every(ext =>
    extensionNames.includes(ext)
  );

  if (isStablecoin) {
    return 'stablecoin';
  }

  // Check for arcade token pattern (no ConfidentialTransferMint)
  const isArcadeToken =
    ARCADE_TOKEN_EXTENSIONS.every(ext => extensionNames.includes(ext)) &&
    !extensionNames.includes('ConfidentialTransferMint') &&
    !extensionNames.includes('ScaledUiAmount');

  if (isArcadeToken) {
    return 'arcade-token';
  }

  // Check for tokenized security pattern
  const isTokenizedSecurity = TOKENIZED_SECURITY_EXTENSIONS.every(ext =>
    extensionNames.includes(ext)
  );

  if (isTokenizedSecurity) {
    return 'tokenized-security';
  }

  return 'unknown';
}

export async function getTokenMetadata(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenMetadata | null> {
  const inspection = await inspectToken(rpc, mintAddress);
  return inspection.metadata || null;
}

export async function getTokenExtensionsDetailed(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenExtension[]> {
  const inspection = await inspectToken(rpc, mintAddress);
  return inspection.extensions;
}

export async function detectTokenTypeFromMint(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenType> {
  const inspection = await inspectToken(rpc, mintAddress);
  return inspection.detectedType;
}

// Helper function to convert inspection result to dashboard data format
export function inspectionResultToDashboardData(
  inspection: TokenInspectionResult
): TokenDashboardData {
  const {
    address,
    supplyInfo,
    metadata,
    authorities,
    extensions,
    detectedType,
    aclMode,
    enableSrfc37,
    scaledUiAmount,
  } = inspection;

  return {
    // Basic token info
    name: metadata?.name || '',
    symbol: metadata?.symbol || '',
    address: address.toString(),
    decimals: supplyInfo.decimals,
    supply: supplyInfo.supply.toString(),
    uri: metadata?.uri,
    type: detectedType,

    // ACL configuration
    aclMode,
    enableSrfc37,

    // All authorities as strings
    mintAuthority: authorities.mintAuthority?.toString(),
    metadataAuthority: authorities.metadataAuthority?.toString(),
    pausableAuthority: authorities.pausableAuthority?.toString(),
    confidentialBalancesAuthority:
      authorities.confidentialBalancesAuthority?.toString(),
    permanentDelegateAuthority:
      authorities.permanentDelegateAuthority?.toString(),
    scaledUiAmountAuthority: authorities.scaledUiAmountAuthority?.toString(),
    freezeAuthority: authorities.freezeAuthority?.toString(),

    // Extensions list
    extensions: extensions.map(ext => ext.name),

    // Scaled UI amount multiplier (for tokenized securities)
    multiplier: scaledUiAmount?.multiplier,
  };
}

// Convenience function to get complete token info for dashboard
export async function getTokenDashboardData(
  rpc: Rpc<SolanaRpcApi>,
  mintAddress: Address
): Promise<TokenDashboardData> {
  const inspection = await inspectToken(rpc, mintAddress);
  return inspectionResultToDashboardData(inspection);
}
