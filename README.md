# Mosaic

A comprehensive TypeScript monorepo for managing Token-2022 tokens with extensions on Solana, specifically designed for Stablecoin and Arcade Token use cases with advanced access control features.

## 🏗️ Project Structure

This monorepo contains the following packages:

- **[@mosaic/sdk](packages/sdk/)** - Core SDK with token templates, management utilities, and Token-2022 integration
- **[@mosaic/cli](packages/cli/)** - Command-line interface for token creation and management
- **[@mosaic/ui](packages/ui/)** - Modern web interface for token management with wallet integration
- **[@mosaic/abl](packages/abl/)** - Address-Based List implementation for SRFC-37 compliance
- **[@mosaic/ebalts](packages/ebalts/)** - Enhanced Balance and Transfer Security for advanced freeze/thaw functionality
- **[@mosaic/tlv-account-resolution](packages/tlv-account-resolution/)** - TLV account resolution utilities for transfer hooks

## 🪙 Token Types

### Stablecoin

Token-2022 Extensions:

- **Default Account State** - SRFC blocklist for compliance
- **Metadata** - On-chain token metadata
- **Confidential Balances** - Privacy-preserving transactions
- **Pausable** - Emergency controls
- **Permanent Delegate** - Regulatory compliance features

### Arcade Token

Token-2022 Extensions:

- **Default Account State** - SRFC allowlist for programs and users
- **Metadata** - Rich on-chain metadata for gaming
- **Permanent Delegate** - Game mechanics control
- **Pausable** - Administrative controls

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Solana CLI

### Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

## 📦 Package Structure

```
packages/
├── sdk/                    # Core SDK with token templates
│   └── src/
│       ├── templates/      # Stablecoin and arcade token templates
│       ├── issuance/       # Token creation utilities
│       ├── management/     # Token operation utilities
│       ├── administration/ # Authority management
│       ├── abl/           # ABL integration utilities
│       └── ebalts/        # EBALTS integration utilities
├── cli/                   # Command-line interface
│   └── src/
│       ├── commands/      # CLI command implementations
│       │   ├── create/    # Token creation commands
│       │   ├── allowlist/ # Allowlist management
│       │   ├── blocklist/ # Blocklist management
│       │   ├── ebalts/    # EBALTS commands
│       │   └── abl/       # ABL commands
│       └── utils/         # CLI utilities
├── ui/                    # Web interface
│   └── src/
│       ├── app/           # Next.js app directory
│       │   └── dashboard/ # Token management dashboard
│       ├── components/    # React components
│       ├── lib/          # Utility functions and integrations
│       └── context/      # React context providers
├── abl/                   # Address-Based Lists (SRFC-37)
│   └── src/
│       ├── generated/     # Auto-generated from IDL
│       └── index.ts       # PDA utilities and exports
├── ebalts/               # Enhanced Balance and Transfer Security
│   └── src/
│       ├── generated/     # Auto-generated from IDL
│       └── index.ts       # EBALTS utilities and exports
└── tlv-account-resolution/ # TLV account resolution
    └── src/
        ├── state.ts       # Core resolution logic
        ├── seeds.ts       # Seed resolution utilities
        └── pubkeyData.ts  # Pubkey data extraction
```

## 🚀 Quick Start

### Using the CLI

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

### Using the Web UI

```bash
# Start the development server
cd packages/ui
pnpm dev

# Open http://localhost:3000 in your browser
```

### Using the SDK

```typescript
import { createStablecoinInitTransaction, createArcadeTokenInitTransaction } from '@mosaic/sdk';
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
  authority
);
```

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
cd packages/sdk  # or cli, ui, abl, ebalts, tlv-account-resolution

# Run package-specific commands
pnpm dev        # Development mode
pnpm build      # Build package
pnpm test       # Run tests
pnpm lint       # Lint code
```

## 🎯 Implementation Status

✅ **Fully Implemented**:
- **SDK**: Complete token templates with Token-2022 integration
- **CLI**: Full command-line interface with all operations
- **Web UI**: Modern React application with wallet integration
- **ABL**: SRFC-37 compliant address-based lists
- **EBALTS**: Enhanced freeze/thaw functionality
- **TLV Resolution**: Account resolution for transfer hooks

## 🏗️ Architecture Overview

The project implements a layered architecture:

1. **Low-level Packages**: `@mosaic/abl`, `@mosaic/ebalts`, `@mosaic/tlv-account-resolution`
2. **Core SDK**: `@mosaic/sdk` integrates all low-level packages
3. **User Interfaces**: `@mosaic/cli` and `@mosaic/ui` provide different ways to interact with the SDK

## 📋 Key Features

### Token-2022 Extensions Support
- **Metadata**: On-chain token metadata with rich information
- **Default Account State**: Configurable account state for compliance
- **Confidential Balances**: Privacy-preserving transaction amounts
- **Pausable**: Emergency pause/unpause functionality for all operations
- **Permanent Delegate**: Regulatory compliance and game mechanics control

### Access Control (SRFC-37)
- **Allowlists**: Restrict token operations to approved addresses
- **Blocklists**: Block specific addresses from token operations
- **Dynamic Resolution**: Runtime account resolution for complex access patterns
- **Programmable Gating**: Custom program integration for access control

### Advanced Security (EBALTS)
- **Enhanced Freeze/Thaw**: Advanced freeze functionality beyond standard Token-2022
- **Permissionless Operations**: Controlled permissionless operations for user experience
- **Gating Program Integration**: External program validation for operations
- **Authority Management**: Granular control over different security functions

## 🔗 Package Dependencies

```
@mosaic/ui
    └── @mosaic/sdk
            ├── @mosaic/abl
            ├── @mosaic/ebalts
            │   └── @mosaic/tlv-account-resolution
            └── @mosaic/tlv-account-resolution

@mosaic/cli
    └── @mosaic/sdk (same as above)
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes in the appropriate package
4. Add tests for new functionality
5. Run the full test suite (`pnpm test`)
6. Ensure code quality (`pnpm check`)
7. Update documentation as needed
8. Commit your changes (`git commit -m 'Add amazing feature'`)
9. Push to the branch (`git push origin feature/amazing-feature`)
10. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Solana Token Extensions Documentation](https://solana.com/developers/guides/token-extensions)
- [Token-2022 Program](https://github.com/solana-program/token-2022)
- [SRFC Standards](https://github.com/solana-foundation/solana-rfcs)
