# Mosaic

A comprehensive TypeScript monorepo for managing Token-2022 tokens with extensions on Solana, specifically designed for different token templates for Stablecoins, RWAs, and Arcade Token. It includes built in advanced access control features such as integration with sRFC-37.

Note: sRFC-37 is still under development and not ready for mainnet use. If you use this repo please be sure to not use sRFC-37 yet.

## Why Mosaic?

Most implementations of standard token types follow similar patterns and usages of Token Extensions. This repo provides issuers and tokenization engines best practices for integrating and using Token Extensions. Additionally apps can use the SDK to easily abstract away complexities related to working with Token Extensions.

## Quickstart

### Prerequisites

- Node.js 20+
- pnpm 10+
- Solana CLI

### Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

### Using the Web UI

```bash
# Start the development server
pnpm run ui

# Open http://localhost:3000 in your browser
```

### Using the CLI

See the [cli readme](packages/cli/README.md) for detailed docs

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Create a stablecoin
cd packages/cli
pnpm start create stablecoin \
  --name "My Stable Coin" \
  --symbol "MSC" \
  --decimals 6 \
  --uri "https://example.com/metadata.json"

# Create an arcade token
pnpm start create arcade-token \
  --name "Game Points" \
  --symbol "POINTS" \
  --decimals 0 \
  --uri "https://example.com/game-metadata.json"
```

### Using the SDK

See the [sdk readme](packages/sdk/README.md) for detailed docs

```typescript
import { createStablecoinInitTransaction, createArcadeTokenInitTransaction } from '@solana/mosaic-sdk';
import { createSolanaRpc, generateKeyPairSigner } from 'gill';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const authority = await generateKeyPairSigner();
const mint = await generateKeyPairSigner();

// Create a stablecoin with compliance features
const tx = await createStablecoinInitTransaction(
    rpc,
    'USD Coin',
    'USDC',
    6,
    'https://example.com/metadata.json',
    authority.address,
    mint,
    authority,
);
```

## Mosaic Packages

This monorepo contains the following packages:

- **[@solana/mosaic-sdk](packages/sdk/)** - Core SDK with token templates, allowlist / blocklist integrations, management utilities, and Token-2022 integration
- **[@solana/mosaic-cli](packages/cli/)** - Command-line interface for token creation and management
- **[@mosaic/app](apps/app/)** - Dashboard application for a full featured tokenization engine for token management with wallet integration and sRFC-37 administration
- **[@mosaic/abl](packages/abl/)** - Allowlist/Blocklist implementation for sRFC-37 compliance
- **[@mosaic/token-acl](packages/token-acl/)** - Token ACL (sRFC-37). This standard provides management of access control lists for Solana Tokens.
- **[@mosaic/tlv-account-resolution](packages/tlv-account-resolution/)** - TLV account resolution utilities

## Token Templates

The majority of tokens fit into a few different templates. This includes Stablecoins, RWAs, Arcade Tokens, Tokenized Equities, and ICOs / App tokens. Generally tokens need the ability to manage access to the token via a blocklist or allowlist, and for compliance reasons also be able to seize & freeze assets. The following breaks down the templates for each token type and corresponds to the templates in the SDK.

### Stablecoin

Token-2022 Extensions:

- **Default Account State** - Required for the sRFC-37 blocklist/allowlist
- **Metadata** - On-chain token metadata
- **Confidential Balances** - Balance encryption for token accounts and transfers
- **Pausable** - Disable all interactions with the token
- **Permanent Delegate** - Burn or transfer funds from any address

### Arcade Token

Token-2022 Extensions:

- **Default Account State** - Required for the sRFC-37 blocklist/allowlist
- **Metadata** - Rich on-chain metadata for gaming
- **Permanent Delegate** - Burn or transfer funds from any address
- **Pausable** - Disable all interactions with the token

### Tokenized Security

Token-2022 Extension:

- **Default Account State** - Required for the sRFC-37 blocklist/allowlist
- **Metadata** - On-chain token metadata
- **Confidential Balances** - Balance encryption for token accounts and transfers
- **Pausable** - Disable all interactions with the token
- **Permanent Delegate** - Burn or transfer funds from any address
- **Scaled UI Amount** - Updatable multiplier for dividend distribution, stock splits, reverse stock splits

## 🔧 Development

### Monorepo Commands

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm build

# Run development mode for all packages
pnpm dev

# Run tests across all packages
pnpm test

# Run integration tests (SDK)
pnpm test:integration

# Lint all packages
pnpm lint
pnpm lint:fix

# Format code
pnpm format
pnpm format:check

# Type checking
pnpm type-check

# Clean build artifacts
pnpm clean

# Pre-commit checks
pnpm precommit
```

### Package-Specific Development

```bash
# Enter a specific package
cd packages/sdk  # or cli, abl, token-acl, tlv-account-resolution
# Or enter an app
cd apps/app

# Run package-specific commands
pnpm dev        # Development mode
pnpm build      # Build package
pnpm test       # Run unit tests
pnpm test:integration # Run integration tests (SDK)
pnpm lint       # Lint code
```

## 🏗️ Architecture Overview

The project implements a layered architecture:

1. **Low-level Packages**: `@mosaic/abl`, `@mosaic/token-acl`, `@mosaic/tlv-account-resolution`
2. **Core SDK**: `@solana/mosaic-sdk` integrates all low-level packages
3. **User Interfaces**: `@solana/mosaic-cli` and `@mosaic/app` provide different ways to interact with the SDK

The monorepo uses Turbo for build orchestration and is organized with:

- `packages/` - Reusable libraries and SDKs
- `apps/` - Applications (dashboard)

## 📋 Key Features

### Token-2022 Extensions Support

- **Metadata**
- **Default Account State**
- **Confidential Balances**
- **Pausable**
- **Permanent Delegate**
- **Scaled UI Amount**

### Access Control Program

- **Allowlists**: Restrict token operations to approved addresses
- **Blocklists**: Block specific addresses from token operations

### Token ACL (sRFC-37)

- **Freeze/Thaw**: Access to underlying freeze functionality in Token-2022
- **Permissionless Operations**: Permissionless freeze / thaw for enhanced onboarding UX
- **Gating Program Integration**: Link to the ABL program. This can be updated to use your own program.
- **Authority Management**: Manage the freeze authority

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes in the appropriate package
4. Add tests for new functionality
5. Run the full test suite (`pnpm test`)
6. Run "precommit" to automatically format and check linting (`pnpm precommit`)
7. Ensure code quality (`pnpm check`)
8. Update documentation as needed
9. Commit your changes (`git commit -m 'Add amazing feature'`)
10. Push to the branch (`git push origin feature/amazing-feature`)
11. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Solana Token Extensions Documentation](https://solana-program.com)
- [More Token Extensions Documentation](https://solana.com/developers/guides/token-extensions/getting-started)
- [Token-2022 Program](https://github.com/solana-program/token-2022)
- [sRFC-37 Standards](https://github.com/solana-foundation/SRFCs/discussions/2)
