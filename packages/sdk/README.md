# @mosaic/sdk

TypeScript SDK for managing Token-2022 tokens with extensions, specifically designed for Stablecoin and Arcade Token use cases.

## Features

- 🪙 **Token Templates**: Pre-configured templates for Stablecoin and Arcade tokens
- 🔧 **Token Management**: Comprehensive token operation utilities (mint, transfer, freeze, thaw)
- 📋 **Access Control**: Allowlist/blocklist management with SRFC-37 compliance
- 🛡️ **Extensions Support**: Built-in support for Token-2022 extensions
- 🔗 **Integration Ready**: Designed for use with CLI and UI packages

## Token Types

### Stablecoin

A regulatory-compliant token template with:

- **Default Account State**: SRFC blocklist for compliance (accounts blocked by default)
- **Metadata**: On-chain token metadata (name, symbol, URI)
- **Confidential Balances**: Privacy-preserving transaction amounts
- **Pausable**: Emergency pause/unpause functionality
- **Permanent Delegate**: Regulatory compliance features

### Arcade Token

A gaming-optimized token template with:

- **Default Account State**: SRFC allowlist for programs and users (accounts allowed by default)
- **Metadata**: Rich on-chain metadata for gaming integration
- **Permanent Delegate**: Game mechanics control
- **Pausable**: Administrative controls for game management

## Installation

```bash
npm install @mosaic/sdk
# or
pnpm add @mosaic/sdk
```

## Quick Start

```typescript
import { createStablecoinInitTransaction, createArcadeTokenInitTransaction } from '@mosaic/sdk';
import { createSolanaRpc, generateKeyPairSigner, createTransaction } from 'gill';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const mintKeyPair = await generateKeyPairSigner();
const feePayerKeyPair = await generateKeyPairSigner();

// Create a stablecoin
const stablecoinTx = await createStablecoinInitTransaction(
  rpc,
  'USD Coin',           // name
  'USDC',              // symbol
  6,                   // decimals
  'https://example.com/metadata.json', // uri
  feePayerKeyPair.address,  // mintAuthority
  mintKeyPair,              // mint
  feePayerKeyPair           // feePayer
);

// Create an arcade token
const arcadeTokenTx = await createArcadeTokenInitTransaction(
  rpc,
  'Game Points',       // name
  'POINTS',           // symbol
  0,                  // decimals
  'https://example.com/game-metadata.json', // uri
  feePayerKeyPair.address,  // mintAuthority
  mintKeyPair,              // mint
  feePayerKeyPair           // feePayer
);
```

## API Reference

### Token Creation

#### `createStablecoinInitTransaction()`

Creates a transaction to initialize a new stablecoin mint with compliance features.

```typescript
const transaction = await createStablecoinInitTransaction(
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  metadataAuthority?: Address,
  pausableAuthority?: Address,
  confidentialBalancesAuthority?: Address,
  permanentDelegateAuthority?: Address
): Promise<FullTransaction>
```

#### `createArcadeTokenInitTransaction()`

Creates a transaction to initialize a new arcade token mint with gaming features.

```typescript
const transaction = await createArcadeTokenInitTransaction(
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  metadataAuthority?: Address,
  pausableAuthority?: Address,
  permanentDelegateAuthority?: Address
): Promise<FullTransaction>
```

### Token Management

The SDK provides comprehensive token management utilities:

- **Minting**: Create new tokens for specified recipients
- **Transfer**: Move tokens between accounts (including force transfers)
- **Freeze/Thaw**: Control account access to tokens
- **Access Lists**: Manage allowlists and blocklists
- **Authority Management**: Update token authorities

### Extensions

The SDK integrates with several extension packages:

- **@mosaic/abl**: Address-based access list management (SRFC-37)
- **@mosaic/ebalts**: Enhanced balance and transfer security
- **@mosaic/tlv-account-resolution**: TLV account resolution utilities

## Architecture

```
src/
├── templates/           # Token type templates
│   ├── stablecoin.ts   # Stablecoin configuration
│   └── arcadeToken.ts  # Arcade token configuration
├── issuance/           # Token creation utilities
├── management/         # Token operation utilities
├── administration/     # Authority management
├── abl/               # Access list management
├── ebalts/            # Enhanced balance security
└── __tests__/         # Test files
```

## Dependencies

- **gill**: Solana RPC client and transaction utilities
- **@mosaic/abl**: Address-based list management
- **@mosaic/ebalts**: Enhanced balance and transfer security
- **@mosaic/tlv-account-resolution**: TLV account resolution

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate test coverage
pnpm test:coverage

# Type checking
pnpm type-check
```

## Testing

The SDK includes comprehensive tests for all functionality:

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode for development
pnpm test:watch
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT - see LICENSE file for details
